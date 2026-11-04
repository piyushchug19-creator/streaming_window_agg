"""Unit tests for FastAPI Gateway endpoints and request handling."""
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from gateway.main import app
from gateway.producer import KafkaMetricsProducer
from gateway.rate_limiter import RedisTokenBucketRateLimiter


@pytest.mark.asyncio
async def test_healthz_endpoint():
    """Verify /healthz returns 200 OK and healthy status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


@pytest.mark.asyncio
async def test_root_endpoint():
    """Verify root endpoint returns operational metadata."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "operational"
        assert "endpoints" in data


@pytest.mark.asyncio
async def test_metrics_ingestion_single_payload():
    """Verify successful ingestion of a single valid metric."""
    mock_producer = AsyncMock(spec=KafkaMetricsProducer)
    mock_producer.send_metric.return_value = None

    mock_limiter = AsyncMock(spec=RedisTokenBucketRateLimiter)
    mock_limiter.is_allowed.return_value = (True, 99.0, 0.0)
    mock_limiter.capacity = 100.0

    with patch("gateway.main.get_kafka_producer", return_value=mock_producer), \
         patch("gateway.rate_limiter.get_rate_limiter", return_value=mock_limiter):
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "metric_name": "api_latency_ms",
                "value": 45.2,
                "timestamp": 1729958400.0,
                "tags": {"service": "order-api", "region": "us-east-1"}
            }
            response = await client.post("/metrics", json=payload)
            assert response.status_code == 202
            data = response.json()
            assert data["status"] == "accepted"
            assert data["accepted_count"] == 1
            mock_producer.send_metric.assert_called_once()


@pytest.mark.asyncio
async def test_metrics_ingestion_batch_payload():
    """Verify successful ingestion of a batch list of metrics."""
    mock_producer = AsyncMock(spec=KafkaMetricsProducer)
    mock_producer.send_batch.return_value = 2

    mock_limiter = AsyncMock(spec=RedisTokenBucketRateLimiter)
    mock_limiter.is_allowed.return_value = (True, 98.0, 0.0)
    mock_limiter.capacity = 100.0

    with patch("gateway.main.get_kafka_producer", return_value=mock_producer), \
         patch("gateway.rate_limiter.get_rate_limiter", return_value=mock_limiter):
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            batch_payload = [
                {"metric_name": "cpu_pct", "value": 78.5},
                {"metric_name": "mem_pct", "value": 62.1},
            ]
            response = await client.post("/metrics", json=batch_payload)
            assert response.status_code == 202
            data = response.json()
            assert data["accepted_count"] == 2
            mock_producer.send_batch.assert_called_once()


@pytest.mark.asyncio
async def test_metrics_ingestion_rate_limited():
    """Verify that when rate limiter denies request, gateway responds with HTTP 429."""
    mock_limiter = AsyncMock(spec=RedisTokenBucketRateLimiter)
    # is_allowed returns (allowed=False, remaining=0.0, retry_after=2.4)
    mock_limiter.is_allowed.return_value = (False, 0.0, 2.4)
    mock_limiter.capacity = 100.0

    with patch("gateway.rate_limiter.get_rate_limiter", return_value=mock_limiter):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"metric_name": "db_connections", "value": 15.0}
            response = await client.post("/metrics", json=payload)
            assert response.status_code == 429
            assert "Retry-After" in response.headers
            assert response.headers["Retry-After"] == "3"  # ceil(2.4)
            data = response.json()
            assert "detail" in data
            assert data["detail"]["error"] == "Too Many Requests"


@pytest.mark.asyncio
async def test_metrics_ingestion_validation_error():
    """Verify that malformed or empty payloads are rejected with 422 Unprocessable Entity."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Invalid: missing 'value' and empty metric_name
        invalid_payload = {"metric_name": "   "}
        response = await client.post("/metrics", json=invalid_payload)
        assert response.status_code == 422
