"""Secondary Worker: Consumes Kafka Dead Letter Queue and Re-attempts Database Writes."""
from datetime import datetime
import json
import logging
import os
import random
import signal
import sys
import time
from typing import Any, Dict, List, Optional
import kafka
from config.settings import Settings, get_settings
from workers.db_writer import DatabaseWriter

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] [dlq-worker] %(message)s",
)
logger = logging.getLogger("dlq_worker")


class DeadLetterQueueWorker:
    """Consumes failed window metric payloads from the Kafka DLQ topic
    and re-attempts persistence to PostgreSQL with exponential backoff and jitter.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.running = False
        self.db_writer = DatabaseWriter(settings=self.settings)
        self.consumer: Optional[kafka.KafkaConsumer] = None
        self.dlq_producer: Optional[kafka.KafkaProducer] = None

    def initialize(self) -> None:
        """Initialize Kafka DLQ consumer and DLQ re-enqueue producer."""
        bootstrap_servers = self.settings.KAFKA_BOOTSTRAP_SERVERS.split(",")
        logger.info(
            "Initializing DLQ Consumer on topic '%s' (group: '%s')...",
            self.settings.KAFKA_DLQ_TOPIC,
            self.settings.KAFKA_DLQ_GROUP_ID,
        )
        self.consumer = kafka.KafkaConsumer(
            self.settings.KAFKA_DLQ_TOPIC,
            bootstrap_servers=bootstrap_servers,
            group_id=self.settings.KAFKA_DLQ_GROUP_ID,
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            auto_commit_interval_ms=1000,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            consumer_timeout_ms=1000,
        )

        self.dlq_producer = kafka.KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retries=3,
        )
        logger.info("DLQ Worker initialized successfully.")

    def parse_envelope_records(self, raw_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert ISO timestamp strings in DLQ records back into datetime objects."""
        parsed = []
        for r in raw_records:
            parsed.append({
                "metric_name": r["metric_name"],
                "window_start": datetime.fromisoformat(r["window_start"]),
                "window_end": datetime.fromisoformat(r["window_end"]),
                "count": int(r["count"]),
                "sum_value": float(r["sum_value"]),
                "avg_value": float(r["avg_value"]),
                "min_value": float(r["min_value"]),
                "max_value": float(r["max_value"]),
                "tags": r.get("tags", {}),
            })
        return parsed

    def calculate_backoff(self, retry_count: int) -> float:
        """Calculate exponential backoff delay with random jitter."""
        base = self.settings.DB_RETRY_BASE_DELAY
        # Cap exponential backoff at 60 seconds
        delay = min(60.0, base * (2 ** retry_count))
        # Add 10-25% random jitter to avoid thundering herd on DB recovery
        jitter = random.uniform(0.1, 0.5) * delay
        return delay + jitter

    def process_dlq_message(self, envelope: Dict[str, Any]) -> None:
        """Attempt to re-write a DLQ message to the database."""
        w_start = envelope.get("window_start")
        raw_records = envelope.get("records", [])
        retry_count = envelope.get("retry_count", 0)
        max_retries = envelope.get("max_retries", self.settings.DB_MAX_RETRIES)

        logger.info(
            "Processing DLQ message for window %s (%d records, attempt %d/%d)...",
            w_start,
            len(raw_records),
            retry_count + 1,
            max_retries,
        )

        if not raw_records:
            logger.warning("DLQ message for window %s contains no records. Skipping.", w_start)
            return

        try:
            records = self.parse_envelope_records(raw_records)
            self.db_writer.flush_window_metrics(records)
            logger.info(
                "SUCCESS: Re-attempted and flushed window %s (%d records) to PostgreSQL from DLQ.",
                w_start,
                len(records),
            )
        except Exception as exc:
            new_retry_count = retry_count + 1
            logger.error(
                "Re-attempt failed for window %s (attempt %d/%d): %s",
                w_start,
                new_retry_count,
                max_retries,
                exc,
            )

            if new_retry_count < max_retries:
                # Calculate backoff delay
                backoff_sec = self.calculate_backoff(new_retry_count)
                logger.info(
                    "Backing off for %.2fs before re-enqueuing window %s to DLQ...",
                    backoff_sec,
                    w_start,
                )
                time.sleep(backoff_sec)

                # Update envelope and re-enqueue to DLQ
                envelope["retry_count"] = new_retry_count
                envelope["last_error"] = str(exc)
                envelope["last_attempt_at"] = time.time()

                if self.dlq_producer:
                    future = self.dlq_producer.send(
                        self.settings.KAFKA_DLQ_TOPIC,
                        key=str(w_start),
                        value=envelope,
                    )
                    future.get(timeout=10.0)
                    logger.info("Re-enqueued window %s to DLQ with retry_count=%d", w_start, new_retry_count)
            else:
                # Max retries exceeded: write to permanent dead letter records table
                logger.critical(
                    "MAX RETRIES EXCEEDED (%d) for window %s. Logging to dead_letter_records table.",
                    max_retries,
                    w_start,
                )
                try:
                    self.db_writer.write_dead_letter_record(
                        payload=envelope,
                        error_message=str(exc),
                        retry_count=new_retry_count,
                    )
                except Exception as table_err:
                    logger.critical(
                        "CRITICAL: Failed to write to dead_letter_records table: %s. Envelope dropped: %s",
                        table_err,
                        envelope,
                    )

    def start(self) -> None:
        """Start the DLQ consumer worker loop."""
        self.initialize()
        self.running = True

        logger.info("DLQ Worker started. Listening for dead letter events...")

        try:
            while self.running:
                batch = self.consumer.poll(timeout_ms=1000, max_records=20)
                for topic_partition, messages in batch.items():
                    for msg in messages:
                        try:
                            self.process_dlq_message(msg.value)
                        except Exception as process_err:
                            logger.error("Unexpected error processing DLQ message: %s", process_err, exc_info=True)
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received.")
        finally:
            self.stop()

    def stop(self) -> None:
        """Gracefully terminate DLQ worker and clean up connections."""
        if not self.running:
            return
        logger.info("Stopping DLQ Worker...")
        self.running = False

        if self.consumer:
            try:
                self.consumer.close()
            except Exception as exc:
                logger.warning("Error closing DLQ consumer: %s", exc)

        if self.dlq_producer:
            try:
                self.dlq_producer.flush()
                self.dlq_producer.close()
            except Exception as exc:
                logger.warning("Error closing DLQ producer: %s", exc)

        logger.info("DLQ Worker shutdown complete.")


def run():
    """Main process entry point for DLQ Worker."""
    worker = DeadLetterQueueWorker()

    def _signal_handler(sig, frame):
        logger.info("Received termination signal %s. Shutting down...", sig)
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    worker.start()


if __name__ == "__main__":
    run()
