"""Database Connection Pool and Lifecycle Manager for PostgreSQL / Neon DB."""
import logging
import os
from pathlib import Path
from typing import Optional
import psycopg
from psycopg_pool import ConnectionPool
from config.settings import Settings, get_settings

logger = logging.getLogger("db.connection")

_pool_instance: Optional[ConnectionPool] = None


def get_db_pool(settings: Optional[Settings] = None) -> ConnectionPool:
    """Retrieve or initialize singleton PostgreSQL connection pool."""
    global _pool_instance
    if _pool_instance is None or _pool_instance.closed:
        cfg = settings or get_settings()
        logger.info("Initializing PostgreSQL connection pool (%s)...", cfg.DATABASE_URL.split("@")[-1])
        _pool_instance = ConnectionPool(
            conninfo=cfg.DATABASE_URL,
            min_size=cfg.DB_POOL_MIN_SIZE,
            max_size=cfg.DB_POOL_MAX_SIZE,
            timeout=10.0,
            open=True,
        )
    return _pool_instance


def close_db_pool() -> None:
    """Close PostgreSQL connection pool gracefully."""
    global _pool_instance
    if _pool_instance and not _pool_instance.closed:
        logger.info("Closing PostgreSQL connection pool...")
        _pool_instance.close()
        _pool_instance = None


def ping_db(settings: Optional[Settings] = None) -> bool:
    """Execute simple test query to verify database health."""
    try:
        pool = get_db_pool(settings)
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                res = cur.fetchone()
                return bool(res and res[0] == 1)
    except Exception as exc:
        logger.warning("Database ping failed: %s", exc)
        return False


def init_db_schema(settings: Optional[Settings] = None) -> None:
    """Apply DDL schema to database if tables do not exist."""
    schema_path = Path(__file__).parent / "schema.sql"
    if not schema_path.exists():
        logger.error("schema.sql not found at %s", schema_path)
        return

    sql_script = schema_path.read_text(encoding="utf-8")
    pool = get_db_pool(settings)
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_script)
            conn.commit()
        logger.info("Database schema initialized successfully.")
    except Exception as exc:
        logger.error("Failed to initialize database schema: %s", exc, exc_info=True)
        raise exc
