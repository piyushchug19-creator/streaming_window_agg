# Streaming Window Metrics Aggregator Pipeline

A distributed, fault-tolerant, high-throughput metrics ingestion and tumbling-window aggregation engine built with **FastAPI**, **Apache Kafka**, **Redis**, and **PostgreSQL (Neon DB compatible)**.

---

## Architecture Overview

```mermaid
flowchart TD
    Client[High-Throughput Metric Producers] -->|POST /metrics| Gateway[FastAPI Gateway]
    
    subgraph "Phase 1: Ingestion & Load Shedding"
        Gateway -->|Atomic Lua Check| RedisTB[(Redis Token Bucket)]
        RedisTB -- Shed Load (HTTP 429) --> Client
        Gateway -->|Accepted Payloads| KP[Kafka Producer]
        KP -->|Publish| KT_Primary[("Kafka: metrics-primary")]
    end

    subgraph "Phase 2: Stream Processing & Windowing"
        KT_Primary -->|Consumer Group| Worker[Primary Stream Worker]
        Worker -->|In-Memory Buffer| MemBuf[Micro-Batch Accumulator]
        MemBuf -->|Atomic Sync| RedisWin[(Redis Window State)]
        RedisWin -->|60s Tumbling Window Close| WindowClose{Window Expired?}
    end

    subgraph "Phase 3: Storage & Resilience"
        WindowClose -->|Acquire Distributed Lock| DBFlush[DB Writer]
        DBFlush -->|Try Upsert| Postgres[(PostgreSQL / Neon DB)]
        DBFlush -.->|Catch Exception (DB Failure)| DLQPub[Publish to DLQ]
        DLQPub --> KT_DLQ[("Kafka: metrics-dlq")]
        KT_DLQ --> DLQWorker[Secondary DLQ Worker]
        DLQWorker -->|Exponential Backoff & Jitter| Postgres
        DLQWorker -.->|Max Retries Exceeded| DeadLetterTable[(dead_letter_records Table)]
    end

    subgraph "Phase 4: Autoscaling"
        HPA[Kubernetes HPA (CPU > 70%)] -.->|Scale Out / In| Worker
    end
```

---

## Pipeline Components

### Phase 1: API Gateway & Ingestion
- **FastAPI Ingestion Endpoint (`/metrics`)**: Accepts single metric objects or high-volume batch arrays.
- **Redis Token Bucket Rate Limiter**: High-throughput atomic Redis Lua script calculating token replenishment based on fractional elapsed time. Drops excess requests with **HTTP 429 Too Many Requests**, providing `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers.
- **Kafka Producer**: Publishes validated metrics to the primary topic (`metrics-primary`) with async non-blocking serialization.
- **Probes**: `/healthz` (liveness) and `/readyz` (readiness checking Kafka & Redis connectivity).

### Phase 2: Stream Workers & 60-Second Tumbling Window
- **Primary Consumer Worker (`workers/primary_worker.py`)**: Subscribes to `metrics-primary` as part of `metrics-aggregator-group`.
- **60-Second Tumbling Window Engine (`workers/window_manager.py`)**:
  - Aligns timestamps to epoch-based non-overlapping 60s windows: `window_start = (ts // 60) * 60`, `window_end = window_start + 60`.
  - Maintains in-memory micro-batch buffers to reduce network I/O before committing state to Redis.
  - Redis distributed state structures:
    - Hashes: `swm:win:{window_start}:{metric}:{tag_hash}` tracking `count`, `sum`, `min`, `max`, `tags`.
    - Active Windows ZSet: `swm:active_windows` scored by `window_end` timestamp.
    - Window Key Set: `swm:win_keys:{window_start}`.
  - Lateness Watermark: Grace period (`WINDOW_WATERMARK_DELAY_SECONDS`) ensuring out-of-order events are captured before closure.
  - Distributed Locking: `swm:lock:win:{window_start}` guarantees exactly one worker finalizes and flushes a closed window slice.

### Phase 3: Storage & Dead Letter Queue (DLQ) Fallback
- **PostgreSQL / Neon DB Writer (`workers/db_writer.py`)**:
  - Writes aggregated metrics to `aggregated_metrics` table with idempotent upserts (`ON CONFLICT (metric_name, window_start, tags) DO UPDATE`).
- **DLQ Fallback**:
  - The database flush is wrapped in a `try/except` block.
  - If PostgreSQL connection fails (e.g. Neon DB cold start, network timeout), the worker captures the error, builds a metadata envelope, and publishes the failed batch to `metrics-dlq`.
- **Secondary DLQ Retry Worker (`workers/dlq_worker.py`)**:
  - Consumes from `metrics-dlq`.
  - Re-attempts database persistence using exponential backoff with randomized jitter to prevent thundering herds on recovery.
  - If retry count exceeds `DB_MAX_RETRIES` (default 5), persists the envelope to the `dead_letter_records` table for auditing.

### Phase 4: Containerization & Kubernetes Orchestration
- **Production Dockerfiles**:
  - `docker/Dockerfile.gateway`: Lightweight Python slim image running Uvicorn with non-root security.
  - `docker/Dockerfile.primary_worker`: Primary window aggregator worker.
  - `docker/Dockerfile.dlq_worker`: Secondary DLQ retry worker.
- **Docker Compose (`docker-compose.yml`)**:
  - Apache Kafka in **KRaft mode** (no ZooKeeper dependency).
  - Redis 7 Alpine.
  - PostgreSQL 16 Alpine with automatic DDL schema initialization.
  - Gateway and Worker containers wired with healthchecks.
- **Kubernetes Manifests (`k8s/`)**:
  - `namespace.yaml`, `configmap.yaml`, `secret.yaml`.
  - `gateway-deployment.yaml` & `gateway-service.yaml`.
  - `primary-worker-deployment.yaml`.
  - `dlq-worker-deployment.yaml`.
  - `hpa-primary-worker.yaml`: Horizontal Pod Autoscaler targeting `primary-worker` deployment, scaling between 2 and 10 pods when CPU utilization exceeds 70%.

---

## Directory Structure

```
├── config/
│   ├── __init__.py
│   └── settings.py              # Pydantic BaseSettings loading from .env & system env
├── gateway/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app with /metrics, /healthz, /readyz
│   ├── rate_limiter.py          # Atomic Redis Lua Token Bucket Rate Limiter
│   ├── producer.py              # Asynchronous Kafka metrics producer
│   └── schemas.py               # Pydantic models for metric payloads and responses
├── workers/
│   ├── __init__.py
│   ├── primary_worker.py        # Primary consumer worker (window aggregation & flush)
│   ├── window_manager.py        # 60s tumbling window state engine in Redis
│   ├── db_writer.py             # PostgreSQL writer with idempotent upserts
│   └── dlq_worker.py            # Secondary retry worker with exponential backoff
├── db/
│   ├── __init__.py
│   ├── connection.py            # PostgreSQL connection pool and healthcheck
│   └── schema.sql               # DDL for aggregated_metrics and dead_letter_records
├── docker/
│   ├── Dockerfile.gateway       # Dockerfile for FastAPI Gateway
│   ├── Dockerfile.primary_worker# Dockerfile for Primary Window Worker
│   └── Dockerfile.dlq_worker    # Dockerfile for DLQ Retry Worker
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── gateway-deployment.yaml
│   ├── gateway-service.yaml
│   ├── primary-worker-deployment.yaml
│   ├── dlq-worker-deployment.yaml
│   └── hpa-primary-worker.yaml  # HPA scaling primary worker on 70% CPU
├── scripts/
│   ├── test_pipeline.py         # End-to-end simulation & architectural verification
│   └── load_generator.py        # High-concurrency load generator & benchmark tool
├── tests/
│   ├── test_gateway.py          # FastAPI endpoint integration tests
│   ├── test_rate_limiter.py     # Token bucket unit tests
│   └── test_windowing.py        # Tumbling window boundary & aggregation unit tests
├── docker-compose.yml           # Full local testing stack (Kafka KRaft, Redis, Postgres)
├── requirements.txt             # Python dependencies
└── .env.example                 # Configuration template
```

---

## Quickstart & Local Testing

### 1. Setup Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 2. Run Automated Unit Tests
```bash
pytest tests -v
```
All 14 tests will execute, validating the Token Bucket rate limiter, tumbling window calculations, tag canonicalization, and FastAPI gateway routes.

### 3. Run End-to-End Simulation Script
Verify the full pipeline lifecycle (window aggregation, DB persistence, failure injection, DLQ routing, and retry recovery) without requiring external services:
```bash
python3 scripts/test_pipeline.py
```

### 4. Running the Local Docker Compose Stack
To launch the complete infrastructure stack:
```bash
docker compose up -d
```
Inspect container health:
```bash
docker compose ps
```

### 5. Ingest Sample Metrics
Single event:
```bash
curl -X POST http://localhost:8001/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metric_name": "http_latency_ms",
    "value": 34.5,
    "tags": {"service": "checkout", "region": "us-east-1"}
  }'
```

Batch events:
```bash
curl -X POST http://localhost:8001/metrics \
  -H "Content-Type: application/json" \
  -d '[
    {"metric_name": "cpu_pct", "value": 45.2, "tags": {"host": "srv-1"}},
    {"metric_name": "cpu_pct", "value": 52.8, "tags": {"host": "srv-2"}},
    {"metric_name": "memory_pct", "value": 71.4, "tags": {"host": "srv-1"}}
  ]'
```

### 6. Run the High-Throughput Load Generator
Benchmark the gateway and observe Token Bucket load shedding (202 vs 429 status codes):
```bash
python3 scripts/load_generator.py http://localhost:8001 500 50
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS aggregated_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    count BIGINT NOT NULL,
    sum_value DOUBLE PRECISION NOT NULL,
    avg_value DOUBLE PRECISION NOT NULL,
    min_value DOUBLE PRECISION NOT NULL,
    max_value DOUBLE PRECISION NOT NULL,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_metric_window_tags 
ON aggregated_metrics (metric_name, window_start, tags);
```

### Connecting to Neon DB (Cloud PostgreSQL)
Set `DATABASE_URL` in `.env` or in Kubernetes `secret.yaml`:
```bash
DATABASE_URL=postgresql://neondb_owner:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

## Kubernetes Deployment Guide

Deploy to your Kubernetes cluster:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/gateway-deployment.yaml
kubectl apply -f k8s/gateway-service.yaml
kubectl apply -f k8s/primary-worker-deployment.yaml
kubectl apply -f k8s/dlq-worker-deployment.yaml
kubectl apply -f k8s/hpa-primary-worker.yaml
```

Check deployment and HPA status:
```bash
kubectl get pods,svc,hpa -n streaming-metrics
```
