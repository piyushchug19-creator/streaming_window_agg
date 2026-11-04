"""Kafka Metrics Producer with High-Throughput Async Ingestion Support."""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from config.settings import Settings, get_settings
from gateway.schemas import MetricPayload

logger = logging.getLogger("gateway.producer")


class KafkaMetricsProducer:
    """Production Kafka Producer for publishing raw metric events.
    
    Supports both aiokafka and threaded kafka-python-ng to ensure high portability
    and non-blocking asynchronous event loop execution.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.topic = self.settings.KAFKA_PRIMARY_TOPIC
        self.bootstrap_servers = self.settings.KAFKA_BOOTSTRAP_SERVERS
        self._producer: Any = None
        self._is_aiokafka: bool = False
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Initialize and start the Kafka producer."""
        async with self._lock:
            if self._producer is not None:
                return

            # Try aiokafka first
            try:
                import aiokafka
                logger.info("Initializing aiokafka producer on %s", self.bootstrap_servers)
                producer = aiokafka.AIOKafkaProducer(
                    bootstrap_servers=self.bootstrap_servers,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                    key_serializer=lambda k: k.encode("utf-8") if k else None,
                    compression_type="gzip",
                    linger_ms=5,
                    acks=1,
                )
                await producer.start()
                self._producer = producer
                self._is_aiokafka = True
                logger.info("aiokafka producer successfully started.")
                return
            except (ImportError, Exception) as exc:
                logger.info("aiokafka not active or failed (%s). Falling back to kafka-python-ng.", exc)

            # Fallback to kafka-python-ng with asynchronous executor
            try:
                import kafka
                logger.info("Initializing kafka-python-ng producer on %s", self.bootstrap_servers)
                loop = asyncio.get_running_loop()
                self._producer = await loop.run_in_executor(
                    None,
                    lambda: kafka.KafkaProducer(
                        bootstrap_servers=self.bootstrap_servers.split(","),
                        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                        key_serializer=lambda k: k.encode("utf-8") if k else None,
                        acks=1,
                        linger_ms=5,
                        compression_type="gzip",
                        retries=3,
                    )
                )
                self._is_aiokafka = False
                logger.info("kafka-python-ng producer successfully started.")
            except Exception as exc:
                logger.error("Failed to initialize Kafka producer: %s", exc, exc_info=True)
                raise exc

    async def send_metric(self, metric: MetricPayload) -> None:
        """Publish a single metric event to Kafka."""
        payload = metric.model_dump()
        key = metric.metric_name

        if self._producer is None:
            raise RuntimeError("Kafka producer is not started.")

        if self._is_aiokafka:
            await self._producer.send_and_wait(self.topic, value=payload, key=key)
        else:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: self._producer.send(self.topic, value=payload, key=key)
            )

    async def send_batch(self, metrics: List[MetricPayload]) -> int:
        """Publish a batch of metric events to Kafka.
        
        Returns:
            Number of metrics successfully queued.
        """
        if self._producer is None:
            raise RuntimeError("Kafka producer is not started.")

        if self._is_aiokafka:
            tasks = [
                self._producer.send(self.topic, value=m.model_dump(), key=m.metric_name)
                for m in metrics
            ]
            await asyncio.gather(*tasks)
            return len(metrics)
        else:
            loop = asyncio.get_running_loop()

            def _sync_send_batch():
                for m in metrics:
                    self._producer.send(self.topic, value=m.model_dump(), key=m.metric_name)
                self._producer.flush()

            await loop.run_in_executor(None, _sync_send_batch)
            return len(metrics)

    async def ping(self) -> bool:
        """Health check probe verifying broker connectivity."""
        if self._producer is None:
            return False
        try:
            if self._is_aiokafka:
                client = self._producer.client
                return bool(client and client._ready)
            else:
                loop = asyncio.get_running_loop()
                bootstrap_connected = await loop.run_in_executor(
                    None,
                    lambda: self._producer.bootstrap_connected()
                )
                return bool(bootstrap_connected)
        except Exception:
            return False

    async def stop(self) -> None:
        """Gracefully flush and terminate the Kafka producer."""
        async with self._lock:
            if self._producer is None:
                return

            logger.info("Closing Kafka producer...")
            try:
                if self._is_aiokafka:
                    await self._producer.stop()
                else:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._producer.close)
            except Exception as exc:
                logger.warning("Error during producer shutdown: %s", exc)
            finally:
                self._producer = None
                logger.info("Kafka producer stopped.")


# Singleton producer instance
_producer_instance: Optional[KafkaMetricsProducer] = None


def get_kafka_producer() -> KafkaMetricsProducer:
    """Retrieve or create singleton Kafka producer."""
    global _producer_instance
    if _producer_instance is None:
        _producer_instance = KafkaMetricsProducer()
    return _producer_instance
