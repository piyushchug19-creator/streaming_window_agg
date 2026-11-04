"""Application Settings and Environment Configuration."""
from functools import lru_cache
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized configuration for Streaming Window Metrics Aggregator."""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Environment
    ENVIRONMENT: str = Field(default="development", description="Runtime environment: development, staging, production")
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # API Gateway
    API_HOST: str = Field(default="0.0.0.0", description="FastAPI host binding")
    API_PORT: int = Field(default=8000, description="FastAPI port binding")
    API_TITLE: str = Field(default="Streaming Window Metrics Aggregator Gateway", description="API Title")
    API_VERSION: str = Field(default="1.0.0", description="API Version")

    # Kafka Configuration
    KAFKA_BOOTSTRAP_SERVERS: str = Field(default="localhost:9092", description="Kafka bootstrap servers comma-separated")
    KAFKA_PRIMARY_TOPIC: str = Field(default="metrics-primary", description="Primary ingestion topic for raw metrics")
    KAFKA_DLQ_TOPIC: str = Field(default="metrics-dlq", description="Dead Letter Queue topic for failed DB flushes")
    KAFKA_GROUP_ID: str = Field(default="metrics-aggregator-group", description="Consumer group ID for primary worker")
    KAFKA_DLQ_GROUP_ID: str = Field(default="metrics-dlq-group", description="Consumer group ID for DLQ retry worker")
    KAFKA_AUTO_OFFSET_RESET: str = Field(default="earliest", description="Kafka auto offset reset: earliest or latest")

    # Redis Configuration (Token Bucket & Tumbling Window State)
    REDIS_HOST: str = Field(default="localhost", description="Redis host")
    REDIS_PORT: int = Field(default=6379, description="Redis port")
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis password")
    REDIS_DB: int = Field(default=0, description="Redis DB index")

    @property
    def REDIS_URL(self) -> str:
        """Construct Redis connection URI."""
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # Token Bucket Rate Limiting (Load Shedding)
    RATE_LIMIT_ENABLED: bool = Field(default=True, description="Enable or disable rate limiting")
    RATE_LIMIT_CAPACITY: float = Field(default=100.0, description="Maximum bucket burst token capacity")
    RATE_LIMIT_REFILL_RATE: float = Field(default=50.0, description="Tokens refilled per second")
    RATE_LIMIT_KEY_PREFIX: str = Field(default="rate_limit", description="Redis key prefix for rate limits")

    # Tumbling Window Aggregation
    WINDOW_SIZE_SECONDS: int = Field(default=60, description="Tumbling window duration in seconds")
    WINDOW_WATERMARK_DELAY_SECONDS: int = Field(default=2, description="Lateness watermark grace period in seconds")
    WINDOW_FLUSH_INTERVAL_SECONDS: float = Field(default=1.0, description="Interval for window closure evaluator loop")
    WINDOW_STATE_TTL_SECONDS: int = Field(default=7200, description="TTL in Redis for stale window states (2 hours)")

    # PostgreSQL / Neon DB Configuration
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/metrics_db",
        description="PostgreSQL connection string (supports Neon DB)"
    )
    DB_POOL_MIN_SIZE: int = Field(default=2, description="Minimum database connection pool size")
    DB_POOL_MAX_SIZE: int = Field(default=10, description="Maximum database connection pool size")
    DB_MAX_RETRIES: int = Field(default=5, description="Maximum retry attempts before routing to permanent DLQ")
    DB_RETRY_BASE_DELAY: float = Field(default=1.0, description="Base exponential backoff delay in seconds")


@lru_cache()
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    return Settings()
