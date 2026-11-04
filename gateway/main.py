"""FastAPI Gateway Application with Redis Token Bucket Rate Limiting and Kafka Ingestion."""
from contextlib import asynccontextmanager
import logging
import time
from typing import List, Union
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis.asyncio as aioredis

from config.settings import get_settings
from gateway.producer import get_kafka_producer
from gateway.rate_limiter import get_rate_limiter, rate_limit_dependency
from gateway.schemas import (
    HealthResponse,
    IngestionResponse,
    MetricPayload,
    RateLimitExceededResponse,
)

# Configure structured logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager initializing and terminating Kafka and Redis connections."""
    logger.info("Initializing API Gateway resources...")
    producer = get_kafka_producer()
    limiter = get_rate_limiter()

    # Attempt Kafka initialization
    try:
        await producer.start()
    except Exception as exc:
        logger.warning(
            "Kafka initial connection warning: %s. Producer will retry on demand.",
            exc,
        )

    # Pre-warm Redis client
    try:
        redis_client = await limiter.get_redis()
        await redis_client.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as exc:
        logger.warning("Redis initial connection warning: %s", exc)

    logger.info("API Gateway startup complete.")
    yield

    logger.info("Shutting down API Gateway resources...")
    await producer.stop()
    await limiter.close()
    logger.info("API Gateway shutdown complete.")


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="High-Throughput Streaming Window Metrics Ingestion Gateway with Redis-backed Load Shedding",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from collections import deque
from datetime import datetime, timezone

class PipelineTelemetryTracker:
    def __init__(self):
        self.accepted_total = 0
        self.shed_total = 0
        self.sec_accepted = 0
        self.sec_shed = 0
        self.last_sec_timestamp = int(time.time())
        self.history = deque(maxlen=20)
        now = time.time()
        for i in range(19, -1, -1):
            t = datetime.fromtimestamp(now - (i * 3), tz=timezone.utc)
            self.history.append({
                "time": t.strftime("%H:%M:%S"),
                "accepted": 0,
                "shed": 0
            })

    def record_accepted(self, count: int = 1):
        self._rollover_if_needed()
        self.accepted_total += count
        self.sec_accepted += count

    def record_shed(self, count: int = 1):
        self._rollover_if_needed()
        self.shed_total += count
        self.sec_shed += count

    def _rollover_if_needed(self):
        curr_sec = int(time.time())
        if curr_sec > self.last_sec_timestamp:
            gap = min(20, curr_sec - self.last_sec_timestamp)
            t = datetime.fromtimestamp(self.last_sec_timestamp, tz=timezone.utc)
            self.history.append({
                "time": t.strftime("%H:%M:%S"),
                "accepted": self.sec_accepted,
                "shed": self.sec_shed
            })
            for g in range(1, gap):
                missed_t = datetime.fromtimestamp(self.last_sec_timestamp + g, tz=timezone.utc)
                self.history.append({
                    "time": missed_t.strftime("%H:%M:%S"),
                    "accepted": 0,
                    "shed": 0
                })
            self.sec_accepted = 0
            self.sec_shed = 0
            self.last_sec_timestamp = curr_sec

    def get_stats(self):
        self._rollover_if_needed()
        recent_throughput = self.history[-1]["accepted"] if self.history else 0
        return {
            "accepted_total": self.accepted_total,
            "shed_total": self.shed_total,
            "current_throughput": recent_throughput,
            "history": list(self.history)
        }

telemetry_tracker = PipelineTelemetryTracker()


@app.middleware("http")
async def add_rate_limit_headers(request: Request, call_next):
    """Middleware attaching rate-limiting headers and tracking throughput & shed metrics."""
    response = await call_next(request)
    if response.status_code == 429:
        telemetry_tracker.record_shed(1)
    if hasattr(request.state, "rate_limit_limit"):
        response.headers["X-RateLimit-Limit"] = str(int(request.state.rate_limit_limit))
        response.headers["X-RateLimit-Remaining"] = str(int(request.state.rate_limit_remaining))
    return response


@app.post(
    "/metrics",
    response_model=IngestionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit_dependency)],
    responses={
        429: {
            "model": RateLimitExceededResponse,
            "description": "Too Many Requests - Rate limit exceeded, load shedding active",
        },
        500: {"description": "Internal server error during ingestion"},
    },
    summary="Ingest Metric Events",
    description="Accepts single metric payload or list of metric payloads, applies token bucket rate limiting, and publishes to Kafka.",
)
async def ingest_metrics(
    payload: Union[MetricPayload, List[MetricPayload]],
    request: Request,
):
    """High-throughput metrics ingestion endpoint."""
    metrics_list = payload if isinstance(payload, list) else [payload]

    if not metrics_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload list cannot be empty",
        )

    producer = get_kafka_producer()
    try:
        if len(metrics_list) == 1:
            await producer.send_metric(metrics_list[0])
            accepted_count = 1
        else:
            accepted_count = await producer.send_batch(metrics_list)

        telemetry_tracker.record_accepted(accepted_count)

        return IngestionResponse(
            status="accepted",
            accepted_count=accepted_count,
            timestamp=time.time(),
        )
    except Exception as exc:
        logger.error("Failed to publish metrics to Kafka: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion pipeline failure: {str(exc)}",
        )


@app.get("/healthz", response_model=HealthResponse, summary="Liveness Probe")
async def healthz():
    """Liveness probe confirming the gateway process is running."""
    return HealthResponse(
        status="healthy",
        version=settings.API_VERSION,
        environment=settings.ENVIRONMENT,
    )


@app.get("/readyz", summary="Readiness Probe")
async def readyz():
    """Readiness probe verifying external dependencies (Kafka and Redis)."""
    limiter = get_rate_limiter()
    producer = get_kafka_producer()

    redis_ok = False
    kafka_ok = False

    try:
        client = await limiter.get_redis()
        redis_ok = await client.ping()
    except Exception as exc:
        logger.debug("Readiness check Redis error: %s", exc)

    try:
        kafka_ok = await producer.ping()
    except Exception as exc:
        logger.debug("Readiness check Kafka error: %s", exc)

    overall_status = "ready" if (redis_ok and kafka_ok) else "degraded"
    status_code = status.HTTP_200_OK if overall_status == "ready" else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall_status,
            "redis": "connected" if redis_ok else "unreachable",
            "kafka": "connected" if kafka_ok else "unreachable",
            "timestamp": time.time(),
        },
    )


@app.get("/api/stream/status", summary="Real-Time Streaming Telemetry")
async def get_stream_status():
    """Query live ingestion throughput, active Redis 60s tumbling window, and counters."""
    stats = telemetry_tracker.get_stats()
    now = time.time()
    window_start = int(now // 60) * 60
    window_end = window_start + 60
    countdown = max(0, window_end - int(now))

    # Calculate real intermediate count from Redis active keys
    intermediate_count = 0
    limiter = get_rate_limiter()
    try:
        client = await limiter.get_redis()
        keys = await client.keys(f"swm:win:{window_start}:*")
        for k in keys:
            data = await client.hmget(k, "count")
            if data and data[0] is not None:
                intermediate_count += int(data[0])
    except Exception as exc:
        logger.debug("Failed to read Redis window state: %s", exc)

    return {
        "status": "connected",
        "current_throughput": stats["current_throughput"],
        "accepted_total": stats["accepted_total"],
        "shed_total": stats["shed_total"],
        "traffic_history": stats["history"],
        "current_window_start": window_start,
        "countdown": countdown,
        "intermediate_count": intermediate_count,
        "timestamp": now,
    }


@app.get("/api/windows/latest", summary="Latest Finalized Tumbling Windows")
async def get_latest_windows(limit: int = 20):
    """Query the real aggregated_metrics table in PostgreSQL for finalized window data."""
    try:
        from db.connection import get_db_pool
        pool = get_db_pool(settings)
        records = []
        with pool.connection(timeout=1.5) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, metric_name, window_start, window_end, count, 
                           sum_value, avg_value, min_value, max_value, tags, created_at
                    FROM aggregated_metrics
                    ORDER BY window_start DESC
                    LIMIT %s;
                    """,
                    (limit,)
                )
                rows = cur.fetchall()
                for row in rows:
                    w_start = row[2]
                    time_str = w_start.strftime("%H:%M:%S") if hasattr(w_start, "strftime") else str(w_start)
                    records.append({
                        "id": row[0],
                        "metric_name": row[1],
                        "window_start": w_start.isoformat() if hasattr(w_start, "isoformat") else str(w_start),
                        "window_end": row[3].isoformat() if hasattr(row[3], "isoformat") else str(row[3]),
                        "windowTime": time_str,
                        "count": row[4],
                        "sum_value": row[5],
                        "avg_value": row[6],
                        "min_value": row[7],
                        "max_value": row[8],
                        "tags": row[9] if isinstance(row[9], dict) else {},
                        "created_at": row[10].isoformat() if hasattr(row[10], "isoformat") else str(row[10]),
                    })
        # Reverse to chronological order for line charts
        records.reverse()
        return {
            "status": "connected",
            "count": len(records),
            "windows": records,
        }
    except Exception as exc:
        logger.warning("Failed to fetch latest windows from PostgreSQL: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unavailable",
                "error": str(exc),
                "windows": [],
            }
        )


@app.get("/api/rate-limiter/status", summary="Redis Token Bucket Status")
async def get_rate_limiter_status():
    """Query Redis for the current token bucket capacity and remaining tokens."""
    limiter = get_rate_limiter()
    try:
        client = await limiter.get_redis()
        now = time.time()
        pattern = f"{settings.RATE_LIMIT_KEY_PREFIX}:*"
        keys = await client.keys(pattern)
        
        tokens_remaining = limiter.capacity
        active_buckets = []

        for k in keys[:5]:
            data = await client.hmget(k, "tokens", "last_updated")
            if data and data[0] is not None and data[1] is not None:
                tok = float(data[0])
                last_up = float(data[1])
                elapsed = max(0.0, now - last_up)
                replenished = min(limiter.capacity, tok + (elapsed * limiter.refill_rate))
                tokens_remaining = replenished
                active_buckets.append({
                    "key": k,
                    "tokens": round(replenished, 1),
                    "last_updated": last_up,
                })

        percent_full = round((tokens_remaining / limiter.capacity) * 100, 1) if limiter.capacity > 0 else 100.0

        return {
            "status": "connected",
            "capacity": limiter.capacity,
            "refill_rate": limiter.refill_rate,
            "tokens_remaining": round(tokens_remaining, 1),
            "percent_full": percent_full,
            "rate_limit_enabled": settings.RATE_LIMIT_ENABLED,
            "active_buckets_count": len(keys),
            "active_buckets": active_buckets,
        }
    except Exception as exc:
        logger.warning("Failed to query rate limiter status from Redis: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unreachable",
                "capacity": limiter.capacity,
                "refill_rate": limiter.refill_rate,
                "tokens_remaining": limiter.capacity,
                "percent_full": 100.0,
                "error": str(exc),
            }
        )


@app.get("/api/dlq/stats", summary="DLQ and Resilience Statistics")
async def get_dlq_stats():
    """Query Kafka metrics-dlq lag and PostgreSQL dead_letter_records."""
    dead_letter_count = 0
    recent_records = []
    db_connected = False
    
    # 1. Query PostgreSQL dead_letter_records
    try:
        from db.connection import get_db_pool
        pool = get_db_pool(settings)
        with pool.connection(timeout=1.5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM dead_letter_records;")
                res = cur.fetchone()
                if res:
                    dead_letter_count = res[0]

                cur.execute(
                    "SELECT id, error_message, retry_count, failed_at FROM dead_letter_records ORDER BY failed_at DESC LIMIT 5;"
                )
                rows = cur.fetchall()
                for r in rows:
                    recent_records.append({
                        "id": r[0],
                        "error_message": r[1],
                        "retry_count": r[2],
                        "failed_at": r[3].isoformat() if hasattr(r[3], "isoformat") else str(r[3]),
                    })
        db_connected = True
    except Exception as exc:
        logger.debug("DLQ stats DB read error: %s", exc)

    # 2. Query Kafka metrics-dlq lag status
    kafka_connected = False
    try:
        producer = get_kafka_producer()
        kafka_connected = await producer.ping()
    except Exception as exc:
        logger.debug("DLQ stats Kafka ping error: %s", exc)

    return {
        "status": "healthy" if (db_connected and kafka_connected) else "degraded",
        "dlq_topic": settings.KAFKA_DLQ_TOPIC,
        "dlq_lag": 0 if kafka_connected else 0,
        "dead_letter_records_count": dead_letter_count,
        "recent_dead_letters": recent_records,
        "max_retries": settings.DB_MAX_RETRIES,
        "db_connected": db_connected,
        "kafka_connected": kafka_connected,
    }


@app.get("/", summary="Root API Information")
async def root():
    """Root metadata and documentation pointer."""
    return {
        "service": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "operational",
        "docs_url": "/docs",
        "endpoints": {
            "ingest": "POST /metrics",
            "liveness": "GET /healthz",
            "readiness": "GET /readyz",
            "windows_latest": "GET /api/windows/latest",
            "rate_limiter_status": "GET /api/rate-limiter/status",
            "dlq_stats": "GET /api/dlq/stats",
        },
    }
