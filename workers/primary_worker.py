"""Primary Stream Worker: Kafka Ingestion, 60-Second Tumbling Window, DB Flush, and DLQ Fallback."""
import json
import logging
import os
import signal
import sys
import time
import uuid
from typing import Any, Dict, List, Optional
import kafka
from config.settings import Settings, get_settings
from db.connection import init_db_schema
from workers.db_writer import DatabaseWriter
from workers.window_manager import WindowManager

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] [primary-worker] %(message)s",
)
logger = logging.getLogger("primary_worker")


class PrimaryStreamWorker:
    """Consumes raw metrics from Kafka primary topic, maintains Redis tumbling window state,
    and flushes to PostgreSQL with Dead Letter Queue fallback on failure.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.worker_id = f"worker-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self.running = False

        self.window_manager = WindowManager(
            worker_id=self.worker_id,
            settings=self.settings,
        )
        self.db_writer = DatabaseWriter(settings=self.settings)

        self.consumer: Optional[kafka.KafkaConsumer] = None
        self.dlq_producer: Optional[kafka.KafkaProducer] = None

    def initialize(self) -> None:
        """Initialize Kafka consumer, DLQ producer, and verify database schema."""
        logger.info("Initializing Primary Stream Worker (ID: %s)...", self.worker_id)
        
        # 1. Initialize DB schema if not already present
        try:
            init_db_schema(self.settings)
        except Exception as exc:
            logger.warning("Database schema init warning (DB may be offline): %s", exc)

        # 2. Setup Kafka Consumer
        bootstrap_servers = self.settings.KAFKA_BOOTSTRAP_SERVERS.split(",")
        logger.info(
            "Connecting Kafka consumer to %s on topic '%s' (group: '%s')...",
            bootstrap_servers,
            self.settings.KAFKA_PRIMARY_TOPIC,
            self.settings.KAFKA_GROUP_ID,
        )
        self.consumer = kafka.KafkaConsumer(
            self.settings.KAFKA_PRIMARY_TOPIC,
            bootstrap_servers=bootstrap_servers,
            group_id=self.settings.KAFKA_GROUP_ID,
            auto_offset_reset=self.settings.KAFKA_AUTO_OFFSET_RESET,
            enable_auto_commit=True,
            auto_commit_interval_ms=1000,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            consumer_timeout_ms=1000,
        )

        # 3. Setup DLQ Producer for failed flushes
        logger.info(
            "Connecting DLQ Kafka producer for topic '%s'...",
            self.settings.KAFKA_DLQ_TOPIC,
        )
        self.dlq_producer = kafka.KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retries=5,
        )
        logger.info("Primary Stream Worker initialized successfully.")

    def publish_to_dlq(self, dlq_envelope: Dict[str, Any]) -> None:
        """Publish failed aggregated window metrics to Kafka Dead Letter Queue."""
        if not self.dlq_producer:
            raise RuntimeError("DLQ Producer is not initialized.")

        w_start = dlq_envelope.get("window_start")
        key = str(w_start) if w_start else "dlq-entry"

        logger.warning(
            "Publishing window %s (%d records) to DLQ topic '%s'...",
            w_start,
            len(dlq_envelope.get("records", [])),
            self.settings.KAFKA_DLQ_TOPIC,
        )
        future = self.dlq_producer.send(
            self.settings.KAFKA_DLQ_TOPIC,
            key=key,
            value=dlq_envelope,
        )
        # Block to guarantee delivery to DLQ before moving on
        future.get(timeout=10.0)
        logger.info("Successfully published window %s to DLQ.", w_start)

    def process_closed_windows(self) -> None:
        """Identify expired 60-second windows and attempt PostgreSQL flush with DLQ fallback."""
        closed_windows = self.window_manager.get_closed_windows()

        for w_start, w_end, records in closed_windows:
            if not records:
                self.window_manager.finalize_window(w_start)
                continue

            logger.info(
                "Closing 60s window [%s -> %s] with %d metric records. Flushing to DB...",
                w_start,
                w_end,
                len(records),
            )

            # Storage & Retry Mechanism: Wrap DB write in try/except block
            try:
                self.db_writer.flush_window_metrics(records)
                self.window_manager.finalize_window(w_start)
            except Exception as exc:
                logger.error(
                    "Database write failed for window %s: %s. Initiating DLQ fallback.",
                    w_start,
                    exc,
                    exc_info=True,
                )
                # Construct DLQ payload envelope
                dlq_envelope = {
                    "window_start": w_start,
                    "window_end": w_end,
                    "records": [
                        {
                            "metric_name": r["metric_name"],
                            "window_start": r["window_start"].isoformat(),
                            "window_end": r["window_end"].isoformat(),
                            "count": r["count"],
                            "sum_value": r["sum_value"],
                            "avg_value": r["avg_value"],
                            "min_value": r["min_value"],
                            "max_value": r["max_value"],
                            "tags": r["tags"],
                        }
                        for r in records
                    ],
                    "error": str(exc),
                    "failed_at": time.time(),
                    "retry_count": 0,
                    "max_retries": self.settings.DB_MAX_RETRIES,
                }
                try:
                    self.publish_to_dlq(dlq_envelope)
                    # Clear window state from Redis so DLQ worker handles retries
                    self.window_manager.finalize_window(w_start)
                except Exception as dlq_err:
                    logger.critical(
                        "CRITICAL: Failed to publish to DLQ for window %s: %s. Retaining lock for retry.",
                        w_start,
                        dlq_err,
                        exc_info=True,
                    )
                    self.window_manager.release_lock(w_start)

    def start(self) -> None:
        """Start the primary stream consumer and windowing loop."""
        self.initialize()
        self.running = True

        logger.info("Primary Stream Worker started. Listening for incoming metrics...")
        last_flush_check = time.time()

        try:
            while self.running:
                # 1. Poll incoming messages from Kafka
                batch = self.consumer.poll(timeout_ms=500, max_records=500)
                records_ingested = 0

                for topic_partition, messages in batch.items():
                    for msg in messages:
                        try:
                            data = msg.value
                            self.window_manager.ingest_event(
                                metric_name=data["metric_name"],
                                value=float(data["value"]),
                                timestamp=float(data.get("timestamp", time.time())),
                                tags=data.get("tags", {}),
                            )
                            records_ingested += 1
                        except Exception as parse_err:
                            logger.error("Failed to parse metric message %s: %s", msg, parse_err)

                # Flush in-memory accumulated buffer to Redis
                if records_ingested > 0:
                    flushed_count = self.window_manager.flush_buffer_to_redis()
                    logger.debug("Ingested %d events (%d aggregated items synced to Redis).", records_ingested, flushed_count)

                # 2. Check for closed 60-second windows periodically
                now = time.time()
                if now - last_flush_check >= self.settings.WINDOW_FLUSH_INTERVAL_SECONDS:
                    self.process_closed_windows()
                    last_flush_check = now

        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received.")
        finally:
            self.stop()

    def stop(self) -> None:
        """Gracefully terminate worker, flush buffers, and close connections."""
        if not self.running:
            return
        logger.info("Stopping Primary Stream Worker...")
        self.running = False

        # Flush any remaining buffer
        try:
            self.window_manager.flush_buffer_to_redis()
        except Exception as exc:
            logger.warning("Error during final buffer flush: %s", exc)

        if self.consumer:
            try:
                self.consumer.close()
            except Exception as exc:
                logger.warning("Error closing Kafka consumer: %s", exc)

        if self.dlq_producer:
            try:
                self.dlq_producer.flush()
                self.dlq_producer.close()
            except Exception as exc:
                logger.warning("Error closing DLQ producer: %s", exc)

        logger.info("Primary Stream Worker shutdown complete.")


def run():
    """Main process entry point for Primary Stream Worker."""
    worker = PrimaryStreamWorker()

    def _signal_handler(sig, frame):
        logger.info("Received termination signal %s. Shutting down...", sig)
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    worker.start()


if __name__ == "__main__":
    run()
