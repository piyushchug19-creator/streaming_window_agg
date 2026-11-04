"""Unit tests for Tumbling Window Aggregator Logic."""
from datetime import datetime, timezone
import pytest
from workers.window_manager import WindowManager


def test_window_bounds_alignment():
    """Verify timestamps align exactly to 60-second boundaries."""
    # 0s boundary
    w_start, w_end = WindowManager.get_window_bounds(0.0, 60)
    assert w_start == 0
    assert w_end == 60

    # 45s should fall into [0, 60)
    w_start, w_end = WindowManager.get_window_bounds(45.0, 60)
    assert w_start == 0
    assert w_end == 60

    # 60.0s should fall into [60, 120)
    w_start, w_end = WindowManager.get_window_bounds(60.0, 60)
    assert w_start == 60
    assert w_end == 120

    # 1729958432.5s (2024-10-26 16:00:32.5 UTC)
    ts = 1729958432.5
    w_start, w_end = WindowManager.get_window_bounds(ts, 60)
    assert w_start == 1729958400
    assert w_end == 1729958460
    assert w_end - w_start == 60


def test_tag_canonical_hashing():
    """Verify that dictionary tag key order does not affect the tag hash."""
    tags_a = {"region": "us-east-1", "service": "auth", "env": "prod"}
    tags_b = {"env": "prod", "service": "auth", "region": "us-east-1"}

    json_a, hash_a = WindowManager.hash_tags(tags_a)
    json_b, hash_b = WindowManager.hash_tags(tags_b)

    assert json_a == json_b
    assert hash_a == hash_b


def test_in_memory_aggregation():
    """Verify that in-memory buffering aggregates count, sum, min, and max accurately."""
    wm = WindowManager(worker_id="test-worker")

    # Ingest multiple events for the same metric within the same window
    base_ts = 1000.0  # window [960, 1020)
    tags = {"host": "web-01"}

    wm.ingest_event("http_requests", value=10.0, timestamp=base_ts, tags=tags)
    wm.ingest_event("http_requests", value=20.0, timestamp=base_ts + 5, tags=tags)
    wm.ingest_event("http_requests", value=5.0, timestamp=base_ts + 10, tags=tags)
    wm.ingest_event("http_requests", value=25.0, timestamp=base_ts + 15, tags=tags)

    canonical_tags, _ = WindowManager.hash_tags(tags)
    w_start, _ = WindowManager.get_window_bounds(base_ts, 60)
    buffer_key = (w_start, "http_requests", canonical_tags)

    assert buffer_key in wm._in_memory_buffer
    buf = wm._in_memory_buffer[buffer_key]

    assert buf["count"] == 4
    assert buf["sum"] == 60.0
    assert buf["min"] == 5.0
    assert buf["max"] == 25.0
    assert buf["sum"] / buf["count"] == 15.0


def test_distinct_metrics_and_tags_isolation():
    """Verify separate metrics and different tags are isolated in separate window buckets."""
    wm = WindowManager(worker_id="test-worker")
    ts = 5000.0

    wm.ingest_event("cpu_usage", 50.0, timestamp=ts, tags={"node": "worker-1"})
    wm.ingest_event("cpu_usage", 70.0, timestamp=ts, tags={"node": "worker-2"})
    wm.ingest_event("memory_mb", 1024.0, timestamp=ts, tags={"node": "worker-1"})

    assert len(wm._in_memory_buffer) == 3
