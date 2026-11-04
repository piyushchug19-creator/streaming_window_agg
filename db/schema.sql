-- Database Schema for Streaming Window Metrics Aggregator Pipeline
-- Compatible with PostgreSQL 14+ and Neon DB Serverless Postgres

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

-- Compound Unique Index for Idempotent Upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_window_tags 
ON aggregated_metrics (metric_name, window_start, tags);

-- Query Optimization Indices
CREATE INDEX IF NOT EXISTS idx_metric_name_window_start 
ON aggregated_metrics (metric_name, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_window_start_range 
ON aggregated_metrics (window_start, window_end);

CREATE INDEX IF NOT EXISTS idx_tags_gin 
ON aggregated_metrics USING GIN (tags);

-- Dead Letter Records Table (Permanent Storage for Unrecoverable Failures)
CREATE TABLE IF NOT EXISTS dead_letter_records (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    error_message TEXT NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_failed_at 
ON dead_letter_records (failed_at DESC);
