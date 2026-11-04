"""Database Writer for Aggregated Window Metrics with Upsert Support."""
import json
import logging
from typing import Any, Dict, List, Optional
import psycopg
from config.settings import Settings, get_settings
from db.connection import get_db_pool

logger = logging.getLogger("workers.db_writer")

UPSERT_AGGREGATED_METRICS_SQL = """
INSERT INTO aggregated_metrics (
    metric_name,
    window_start,
    window_end,
    count,
    sum_value,
    avg_value,
    min_value,
    max_value,
    tags
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
ON CONFLICT (metric_name, window_start, tags) DO UPDATE SET
    count = EXCLUDED.count,
    sum_value = EXCLUDED.sum_value,
    avg_value = EXCLUDED.avg_value,
    min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value,
    window_end = EXCLUDED.window_end,
    created_at = NOW();
"""

INSERT_DEAD_LETTER_RECORD_SQL = """
INSERT INTO dead_letter_records (
    payload,
    error_message,
    retry_count
) VALUES (%s::jsonb, %s, %s);
"""


class DatabaseWriter:
    """Manages transactional batch persistence of aggregated metrics to PostgreSQL."""

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()

    def flush_window_metrics(self, records: List[Dict[str, Any]]) -> int:
        """Write a batch of aggregated metric records to PostgreSQL.
        
        Args:
            records: List of dictionaries matching the aggregated_metrics schema.
            
        Returns:
            Number of records successfully written.
            
        Raises:
            Exception: Any database connection or execution failure.
        """
        if not records:
            return 0

        pool = get_db_pool(self.settings)

        # Prepare parameters
        params = [
            (
                r["metric_name"],
                r["window_start"],
                r["window_end"],
                r["count"],
                r["sum_value"],
                r["avg_value"],
                r["min_value"],
                r["max_value"],
                json.dumps(r["tags"]),
            )
            for r in records
        ]

        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(UPSERT_AGGREGATED_METRICS_SQL, params)
            conn.commit()

        logger.info("Successfully persisted %d aggregated metric records.", len(records))
        return len(records)

    def write_dead_letter_record(self, payload: Dict[str, Any], error_message: str, retry_count: int) -> None:
        """Persist a failed message envelope to the dead_letter_records table."""
        pool = get_db_pool(self.settings)
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    INSERT_DEAD_LETTER_RECORD_SQL,
                    (json.dumps(payload), error_message, retry_count),
                )
            conn.commit()
        logger.warning(
            "Logged unrecoverable message to dead_letter_records (retries: %d). Error: %s",
            retry_count,
            error_message,
        )
