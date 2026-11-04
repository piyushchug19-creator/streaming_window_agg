"""Data Transfer Objects and Schemas for API Gateway."""
import time
from typing import Dict, List, Optional, Union
from pydantic import BaseModel, Field, field_validator


class MetricPayload(BaseModel):
    """Payload schema for an ingested individual metric event."""
    metric_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Name of the metric (e.g., api_latency_ms, request_count, cpu_percent)"
    )
    value: float = Field(
        ...,
        description="Numeric metric measurement value"
    )
    timestamp: float = Field(
        default_factory=time.time,
        description="Unix epoch timestamp in seconds"
    )
    tags: Dict[str, str] = Field(
        default_factory=dict,
        description="Dimensional key-value metadata tags (e.g. host, region, service)"
    )

    @field_validator("metric_name")
    @classmethod
    def validate_metric_name(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("metric_name cannot be empty or whitespace only")
        return v_stripped

    model_config = {
        "json_schema_extra": {
            "example": {
                "metric_name": "http_request_duration_ms",
                "value": 42.5,
                "timestamp": 1729958400.0,
                "tags": {
                    "service": "checkout-service",
                    "endpoint": "/api/v1/checkout",
                    "status_code": "200"
                }
            }
        }
    }


class IngestionResponse(BaseModel):
    """Successful ingestion response."""
    status: str = Field(default="accepted", description="Status code description")
    accepted_count: int = Field(..., description="Number of metric events successfully queued")
    timestamp: float = Field(default_factory=time.time, description="Processing timestamp")


class RateLimitExceededResponse(BaseModel):
    """Response payload when load shedding drops excess requests."""
    error: str = Field(default="Too Many Requests")
    message: str = Field(default="Rate limit exceeded. Load shedding active.")
    retry_after: float = Field(..., description="Seconds until bucket has sufficient tokens")


class HealthResponse(BaseModel):
    """System health check status response."""
    status: str
    version: str
    environment: str
    redis: Optional[str] = None
    kafka: Optional[str] = None
    timestamp: float = Field(default_factory=time.time)
