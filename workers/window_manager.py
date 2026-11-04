"""60-Second Tumbling Window Aggregator and Redis State Manager."""
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import redis
from config.settings import Settings, get_settings

logger = logging.getLogger("workers.window_manager")

# Atomic Lua script for updating metric aggregation in Redis
INGEST_METRIC_LUA = """
local hash_key = KEYS[1]
local win_keys_set = KEYS[2]
local active_zset = KEYS[3]

local metric_name = ARGV[1]
local tags_json = ARGV[2]
local window_start = ARGV[3]
local window_end = ARGV[4]
local val = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])

-- Check existing data in hash
local data = redis.call('HMGET', hash_key, 'count', 'sum', 'min', 'max')
local count = tonumber(data[1]) or 0
local sum_val = tonumber(data[2]) or 0.0
local min_val = tonumber(data[3])
local max_val = tonumber(data[4])

count = count + 1
sum_val = sum_val + val

if min_val == nil or val < min_val then
    min_val = val
end

if max_val == nil or val > max_val then
    max_val = val
end

redis.call('HMSET', hash_key,
    'metric_name', metric_name,
    'tags', tags_json,
    'window_start', window_start,
    'window_end', window_end,
    'count', tostring(count),
    'sum', tostring(sum_val),
    'min', tostring(min_val),
    'max', tostring(max_val)
)

redis.call('EXPIRE', hash_key, ttl)
redis.call('SADD', win_keys_set, hash_key)
redis.call('EXPIRE', win_keys_set, ttl)
redis.call('ZADD', active_zset, tonumber(window_end), window_start)

return count
"""


class WindowManager:
    """Manages 60-second tumbling window state in Redis with in-memory buffering.
    
    Coordinates distributed aggregation across multiple worker replicas.
    """

    def __init__(
        self,
        worker_id: str,
        settings: Optional[Settings] = None,
        redis_client: Optional[redis.Redis] = None,
    ):
        self.worker_id = worker_id
        self.settings = settings or get_settings()
        self.window_size = self.settings.WINDOW_SIZE_SECONDS
        self.watermark_delay = self.settings.WINDOW_WATERMARK_DELAY_SECONDS
        self.ttl = self.settings.WINDOW_STATE_TTL_SECONDS
        
        self.redis = redis_client or redis.Redis.from_url(
            self.settings.REDIS_URL,
            decode_responses=True,
        )

        # In-memory buffer for high-throughput batching before syncing to Redis
        # Key: (window_start, metric_name, canonical_tags_str)
        # Value: {"count": int, "sum": float, "min": float, "max": float, "tags": dict, "window_end": int}
        self._in_memory_buffer: Dict[Tuple[int, str, str], Dict[str, Any]] = {}
        self._buffer_lock = False

    @staticmethod
    def get_window_bounds(timestamp: float, window_size: int = 60) -> Tuple[int, int]:
        """Compute window_start and window_end epoch integers for a given timestamp."""
        window_start = int(math.floor(timestamp / window_size)) * window_size
        window_end = window_start + window_size
        return window_start, window_end

    @staticmethod
    def hash_tags(tags: Dict[str, str]) -> Tuple[str, str]:
        """Produce canonical sorted JSON string and its MD5 hash for tags."""
        canonical_json = json.dumps(tags, sort_keys=True, separators=(",", ":"))
        tag_hash = hashlib.md5(canonical_json.encode("utf-8")).hexdigest()[:12]
        return canonical_json, tag_hash

    def ingest_event(
        self,
        metric_name: str,
        value: float,
        timestamp: Optional[float] = None,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        """Ingest a metric event into the in-memory window buffer."""
        ts = timestamp if timestamp is not None else time.time()
        tags_dict = tags or {}
        canonical_tags, tag_hash = self.hash_tags(tags_dict)
        window_start, window_end = self.get_window_bounds(ts, self.window_size)

        buffer_key = (window_start, metric_name, canonical_tags)

        if buffer_key in self._in_memory_buffer:
            item = self._in_memory_buffer[buffer_key]
            item["count"] += 1
            item["sum"] += value
            item["min"] = min(item["min"], value)
            item["max"] = max(item["max"], value)
        else:
            self._in_memory_buffer[buffer_key] = {
                "metric_name": metric_name,
                "window_start": window_start,
                "window_end": window_end,
                "canonical_tags": canonical_tags,
                "tag_hash": tag_hash,
                "tags_dict": tags_dict,
                "count": 1,
                "sum": float(value),
                "min": float(value),
                "max": float(value),
            }

    def flush_buffer_to_redis(self) -> int:
        """Flush in-memory aggregated metrics into Redis.
        
        Returns:
            Number of aggregated metric items committed to Redis.
        """
        if not self._in_memory_buffer:
            return 0

        # Snapshot and clear buffer
        items = list(self._in_memory_buffer.values())
        self._in_memory_buffer.clear()

        pipe = self.redis.pipeline()
        for item in items:
            hash_key = (
                f"swm:win:{item['window_start']}:{item['metric_name']}:{item['tag_hash']}"
            )
            win_keys_set = f"swm:win_keys:{item['window_start']}"
            active_zset = "swm:active_windows"

            # Execute Lua script atomically
            pipe.eval(
                INGEST_METRIC_LUA,
                3,
                hash_key,
                win_keys_set,
                active_zset,
                item["metric_name"],
                item["canonical_tags"],
                str(item["window_start"]),
                str(item["window_end"]),
                str(item["sum"] / item["count"]) if item["count"] > 1 else str(item["sum"]),
                str(self.ttl),
            )

        pipe.execute()
        return len(items)

    def get_closed_windows(self) -> List[Tuple[int, int, List[Dict[str, Any]]]]:
        """Identify windows that have closed (window_end + watermark <= now) and acquire distributed locks.
        
        Returns:
            List of tuples: (window_start, window_end, list_of_aggregated_records)
        """
        now = time.time()
        max_closed_score = now - self.watermark_delay

        # Query active windows with window_end <= max_closed_score
        closed_start_times = self.redis.zrangebyscore("swm:active_windows", "-inf", max_closed_score)
        results = []

        for w_start_str in closed_start_times:
            w_start = int(w_start_str)
            w_end = w_start + self.window_size

            # Acquire distributed lock so only one worker flushes this window
            lock_key = f"swm:lock:win:{w_start}"
            lock_acquired = self.redis.set(lock_key, self.worker_id, nx=True, ex=120)

            if not lock_acquired:
                logger.debug(
                    "Worker %s could not acquire lock for window %s (already being processed).",
                    self.worker_id,
                    w_start,
                )
                continue

            # Fetch all metric keys in this window
            keys_set_name = f"swm:win_keys:{w_start}"
            metric_keys = self.redis.smembers(keys_set_name)

            if not metric_keys:
                # No metric keys left; window already flushed or empty
                self.redis.zrem("swm:active_windows", w_start_str)
                self.redis.delete(lock_key)
                continue

            # Fetch aggregated records from Redis hashes
            pipe = self.redis.pipeline()
            for k in metric_keys:
                pipe.hgetall(k)
            hashes_data = pipe.execute()

            records = []
            for data in hashes_data:
                if not data or "count" not in data:
                    continue

                count = int(data.get("count", 0))
                sum_val = float(data.get("sum", 0.0))
                min_val = float(data.get("min", 0.0))
                max_val = float(data.get("max", 0.0))
                avg_val = (sum_val / count) if count > 0 else 0.0

                try:
                    tags = json.loads(data.get("tags", "{}"))
                except Exception:
                    tags = {}

                record = {
                    "metric_name": data.get("metric_name", "unknown"),
                    "window_start": datetime.fromtimestamp(w_start, tz=timezone.utc),
                    "window_end": datetime.fromtimestamp(w_end, tz=timezone.utc),
                    "count": count,
                    "sum_value": sum_val,
                    "avg_value": avg_val,
                    "min_value": min_val,
                    "max_value": max_val,
                    "tags": tags,
                }
                records.append(record)

            results.append((w_start, w_end, records))

        return results

    def finalize_window(self, window_start: int) -> None:
        """Clean up Redis state for a successfully flushed window and release lock."""
        w_start_str = str(window_start)
        keys_set_name = f"swm:win_keys:{window_start}"
        metric_keys = self.redis.smembers(keys_set_name)

        pipe = self.redis.pipeline()
        for k in metric_keys:
            pipe.delete(k)
        pipe.delete(keys_set_name)
        pipe.zrem("swm:active_windows", w_start_str)
        pipe.delete(f"swm:lock:win:{window_start}")
        pipe.execute()
        logger.info("Window %s successfully finalized and cleared from Redis.", window_start)

    def release_lock(self, window_start: int) -> None:
        """Release distributed lock for a window without clearing its state (e.g. for retry)."""
        lock_key = f"swm:lock:win:{window_start}"
        # Only delete lock if held by this worker
        current_holder = self.redis.get(lock_key)
        if current_holder == self.worker_id:
            self.redis.delete(lock_key)
            logger.debug("Released lock on window %s for worker %s.", window_start, self.worker_id)
