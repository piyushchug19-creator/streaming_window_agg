"""Unit tests for Token Bucket Rate Limiter logic."""
import math
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException
from gateway.rate_limiter import RedisTokenBucketRateLimiter, extract_client_identifier


@pytest.mark.asyncio
async def test_token_bucket_initial_consumption():
    """Verify that an initial request gets accepted and consumes tokens."""
    mock_redis = AsyncMock()
    # Mock Redis eval returning: [allowed=1, remaining="99.0", retry_after="0.0"]
    mock_redis.eval.return_value = ["1", "99.0", "0.0"]

    limiter = RedisTokenBucketRateLimiter(
        capacity=100.0,
        refill_rate=50.0,
        redis_client=mock_redis,
    )

    allowed, remaining, retry_after = await limiter.is_allowed("test-client", tokens_requested=1.0)
    assert allowed is True
    assert remaining == 99.0
    assert retry_after == 0.0


@pytest.mark.asyncio
async def test_token_bucket_exhaustion_and_retry_after():
    """Verify that exceeding token capacity rejects request and returns positive retry-after."""
    mock_redis = AsyncMock()
    # Mock Redis eval returning: [allowed=0, remaining="0.0", retry_after="1.5"]
    mock_redis.eval.return_value = ["0", "0.0", "1.5"]

    limiter = RedisTokenBucketRateLimiter(
        capacity=10.0,
        refill_rate=2.0,
        redis_client=mock_redis,
    )

    allowed, remaining, retry_after = await limiter.is_allowed("heavy-client", tokens_requested=1.0)
    assert allowed is False
    assert remaining == 0.0
    assert retry_after == 1.5


@pytest.mark.asyncio
async def test_token_bucket_fail_open_on_redis_error():
    """Verify graceful fail-open resilience when Redis is unreachable."""
    mock_redis = AsyncMock()
    mock_redis.eval.side_effect = ConnectionError("Redis cluster unreachable")

    limiter = RedisTokenBucketRateLimiter(
        capacity=100.0,
        refill_rate=50.0,
        redis_client=mock_redis,
    )

    allowed, remaining, retry_after = await limiter.is_allowed("test-client")
    # Should fail-open with True to prevent service outage
    assert allowed is True
    assert remaining == 100.0
    assert retry_after == 0.0


def test_extract_client_identifier():
    """Verify client identifier extraction order."""
    # 1. Custom header X-Client-ID
    req1 = MagicMock()
    req1.headers = {"X-Client-ID": "tenant-abc"}
    assert extract_client_identifier(req1) == "client:tenant-abc"

    # 2. X-Forwarded-For
    req2 = MagicMock()
    req2.headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18"}
    assert extract_client_identifier(req2) == "ip:203.0.113.195"

    # 3. Direct client host
    req3 = MagicMock()
    req3.headers = {}
    req3.client.host = "192.168.1.50"
    assert extract_client_identifier(req3) == "ip:192.168.1.50"
