"""Redis-Backed Token Bucket Rate Limiter for Load Shedding."""
import logging
import math
import time
from typing import Optional, Tuple
from fastapi import HTTPException, Request, status
import redis.asyncio as aioredis
from config.settings import Settings, get_settings

logger = logging.getLogger("rate_limiter")

# Atomic Token Bucket Lua Script
# Evaluates token replenishment and consumption in a single Redis transaction
TOKEN_BUCKET_LUA_SCRIPT = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'tokens', 'last_updated')
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if tokens == nil or last_updated == nil then
    tokens = capacity
    last_updated = now
else
    local elapsed = math.max(0, now - last_updated)
    tokens = math.min(capacity, tokens + (elapsed * refill_rate))
    last_updated = now
end

local allowed = 0
local retry_after = 0

if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
else
    local deficit = requested - tokens
    retry_after = deficit / refill_rate
end

redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_updated', tostring(last_updated))
redis.call('EXPIRE', key, ttl)

return {allowed, tostring(tokens), tostring(retry_after)}
"""


class RedisTokenBucketRateLimiter:
    """High-throughput distributed Token Bucket Rate Limiter using Redis Lua script.
    
    Attributes:
        capacity: Maximum token burst size the bucket can hold.
        refill_rate: Tokens added per second.
        redis_client: Async Redis connection pool.
    """

    def __init__(
        self,
        capacity: Optional[float] = None,
        refill_rate: Optional[float] = None,
        redis_client: Optional[aioredis.Redis] = None,
        settings: Optional[Settings] = None,
    ):
        self.settings = settings or get_settings()
        self.capacity = capacity if capacity is not None else self.settings.RATE_LIMIT_CAPACITY
        self.refill_rate = refill_rate if refill_rate is not None else self.settings.RATE_LIMIT_REFILL_RATE
        self.redis_client = redis_client
        self._script_sha: Optional[str] = None
        # TTL for the Redis key: twice the time required to refill from empty to full
        self.key_ttl = max(60, int(math.ceil((self.capacity / max(self.refill_rate, 0.1)) * 2)))

    async def get_redis(self) -> aioredis.Redis:
        """Lazily initialize or return existing Redis client."""
        if self.redis_client is None:
            self.redis_client = aioredis.from_url(
                self.settings.REDIS_URL,
                decode_responses=True,
                max_connections=50
            )
        return self.redis_client

    async def is_allowed(
        self,
        key: str,
        tokens_requested: float = 1.0,
    ) -> Tuple[bool, float, float]:
        """Check whether the requested number of tokens can be consumed.
        
        Args:
            key: Unique identifier for the client bucket (e.g. rate_limit:ip_or_id).
            tokens_requested: Number of tokens requested.
            
        Returns:
            Tuple of (is_allowed, remaining_tokens, retry_after_seconds)
        """
        if not self.settings.RATE_LIMIT_ENABLED:
            return True, self.capacity, 0.0

        try:
            client = await self.get_redis()
            now = time.time()
            redis_key = f"{self.settings.RATE_LIMIT_KEY_PREFIX}:{key}"

            # Execute atomic script
            res = await client.eval(
                TOKEN_BUCKET_LUA_SCRIPT,
                1,
                redis_key,
                str(self.capacity),
                str(self.refill_rate),
                str(now),
                str(tokens_requested),
                str(self.key_ttl),
            )

            allowed = bool(int(res[0]))
            remaining = float(res[1])
            retry_after = float(res[2])

            return allowed, remaining, retry_after
        except Exception as exc:
            logger.warning(
                "Redis rate limiter encounter error: %s. Falling back to fail-open.",
                exc,
                exc_info=True
            )
            # Fail-open strategy to prevent complete service downtime if Redis has transient network failure
            return True, self.capacity, 0.0

    async def close(self):
        """Close Redis connection pool."""
        if self.redis_client:
            await self.redis_client.aclose()
            self.redis_client = None


def extract_client_identifier(request: Request) -> str:
    """Extract a unique client identifier from HTTP request headers or IP."""
    # 1. Check custom client ID header
    client_id = request.headers.get("X-Client-ID")
    if client_id:
        return f"client:{client_id.strip()}"

    # 2. Check X-Forwarded-For header (first entry for originating IP behind proxy)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
        return f"ip:{client_ip}"

    # 3. Check X-Real-IP
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return f"ip:{real_ip.strip()}"

    # 4. Fallback to direct client host
    if request.client and request.client.host:
        return f"ip:{request.client.host}"

    return "ip:anonymous"


# Global singleton instance for injection
_rate_limiter_instance: Optional[RedisTokenBucketRateLimiter] = None


def get_rate_limiter() -> RedisTokenBucketRateLimiter:
    """Retrieve or create singleton rate limiter."""
    global _rate_limiter_instance
    if _rate_limiter_instance is None:
        _rate_limiter_instance = RedisTokenBucketRateLimiter()
    return _rate_limiter_instance


async def rate_limit_dependency(request: Request) -> None:
    """FastAPI Dependency for enforcing Token Bucket rate limiting on endpoints."""
    limiter = get_rate_limiter()
    client_key = extract_client_identifier(request)

    allowed, remaining, retry_after = await limiter.is_allowed(client_key, tokens_requested=1.0)

    # Store rate limit context in request state for downstream headers
    request.state.rate_limit_limit = limiter.capacity
    request.state.rate_limit_remaining = max(0.0, remaining)
    request.state.rate_limit_retry_after = retry_after

    if not allowed:
        retry_seconds = max(1, math.ceil(retry_after))
        headers = {
            "Retry-After": str(retry_seconds),
            "X-RateLimit-Limit": str(int(limiter.capacity)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(retry_seconds),
        }
        logger.warning(
            "Rate limit exceeded for %s. Dropping request with 429. Retry-After: %ss",
            client_key,
            retry_seconds
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Too Many Requests",
                "message": "Rate limit exceeded. Load shedding active.",
                "retry_after": retry_after,
            },
            headers=headers,
        )
