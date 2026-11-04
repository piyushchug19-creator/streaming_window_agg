"""High-Throughput Load Generator and Stress Testing Tool.

Emits realistic metrics traffic to the FastAPI /metrics endpoint to test:
- Real high-volume event ingestion throughput into Kafka.
- Redis Token Bucket load shedding (verifying HTTP 202 vs HTTP 429).
- Live 60-second tumbling window aggregation and persistence to PostgreSQL.
"""
import argparse
import asyncio
from pathlib import Path
import random
import sys
import time
from typing import Dict, List
import httpx

# Ensure root directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

METRIC_NAMES = [
  "checkout_latency_ms",
  "payment_processing_time_ms",
  "order_valuation_usd",
  "cart_item_count",
  "db_query_duration_ms",
]

SERVICES = ["checkout", "payment-service", "inventory", "cart-api", "auth"]
REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "ap-south-1"]


async def send_metric_request(
    client: httpx.AsyncClient,
    base_url: str,
    metric_name: str,
    client_id: str,
) -> int:
    """Send a single metric ingestion request."""
    payload = {
        "metric_name": metric_name,
        "value": round(random.uniform(5.0, 180.0), 2),
        "timestamp": time.time(),
        "tags": {
            "service": random.choice(SERVICES),
            "region": random.choice(REGIONS),
            "client": client_id,
        },
    }
    headers = {"X-Client-ID": client_id}
    try:
        resp = await client.post(f"{base_url}/metrics", json=payload, headers=headers)
        return resp.status_code
    except Exception:
        return 500


async def run_streaming_load(
    base_url: str,
    rate_per_sec: int,
    duration_secs: int,
    concurrency: int,
    client_id: str,
):
    """Continuously stream metrics at a designated rate per second."""
    print("=" * 70)
    print("STREAMING LIVE METRICS TO BACKEND")
    print(f"Target URL:    {base_url}/metrics")
    print(f"Rate:          ~{rate_per_sec} requests/sec")
    print(f"Duration:      {duration_secs} seconds" if duration_secs > 0 else "Duration:      Continuous (Press Ctrl+C to stop)")
    print(f"Concurrency:   {concurrency} workers")
    print("=" * 70)

    limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(limits=limits, timeout=5.0) as client:
        start_time = time.time()
        total_sent = 0
        status_totals: Dict[int, int] = {}
        interval_secs = 1.0

        try:
            sec_counter = 0
            while True:
                if duration_secs > 0 and (time.time() - start_time) >= duration_secs:
                    break

                t_batch_start = time.perf_counter()
                
                # Dispatch batch for current 1-second slot
                tasks = []
                for _ in range(rate_per_sec):
                    metric = random.choice(METRIC_NAMES)
                    tasks.append(send_metric_request(client, base_url, metric, client_id))

                results = await asyncio.gather(*tasks, return_exceptions=True)

                sec_counts: Dict[int, int] = {}
                for res in results:
                    code = res if isinstance(res, int) else 500
                    sec_counts[code] = sec_counts.get(code, 0) + 1
                    status_totals[code] = status_totals.get(code, 0) + 1
                    total_sent += 1

                sec_counter += 1
                accepted_sec = sec_counts.get(202, 0)
                shed_sec = sec_counts.get(429, 0)
                errors_sec = sum(v for k, v in sec_counts.items() if k not in (202, 429))

                now_str = time.strftime("%H:%M:%S")
                print(
                    f"[{now_str}] Sec {sec_counter:3d}: Sent {len(results):3d} reqs | "
                    f"Accepted (202): {accepted_sec:3d} | "
                    f"Shed (429): {shed_sec:2d} | "
                    f"Errors: {errors_sec:1d} | "
                    f"Total: {total_sent:,}"
                )

                # Sleep to maintain designated per-second rate
                t_spent = time.perf_counter() - t_batch_start
                sleep_time = max(0.0, interval_secs - t_spent)
                await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            pass
        except KeyboardInterrupt:
            print("\nStreaming paused by user.")

    elapsed = max(0.001, time.time() - start_time)
    print("\n" + "=" * 70)
    print("STREAMING COMPLETE SUMMARY")
    print(f"Total Requests: {total_sent:,}")
    print(f"Elapsed Time:   {elapsed:.1f}s")
    print(f"Avg Throughput: {total_sent / elapsed:.1f} req/sec")
    for code, count in sorted(status_totals.items()):
        lbl = "Accepted (202)" if code == 202 else ("Shed Load (429)" if code == 429 else f"Error ({code})")
        pct = (count / max(1, total_sent)) * 100
        print(f"  HTTP {code} [{lbl}]: {count:,} ({pct:.1f}%)")
    print("=" * 70)


def auto_detect_url() -> str:
    """Check if port 8001 (Docker) or 8000 is open."""
    for candidate in ["http://localhost:8001", "http://127.0.0.1:8001", "http://localhost:8000"]:
        try:
            r = httpx.get(f"{candidate}/healthz", timeout=0.8)
            if r.status_code == 200:
                return candidate
        except Exception:
            continue
    return "http://localhost:8001"


def main():
    parser = argparse.ArgumentParser(
        description="Stream synthetic metrics into the Streaming Window Metrics Aggregator pipeline."
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="Target base URL of FastAPI gateway (defaults to auto-detecting http://localhost:8001).",
    )
    parser.add_argument(
        "--rate",
        type=int,
        default=60,
        help="Target metric events streamed per second (default: 60 req/s).",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=120,
        help="Total duration in seconds to stream (default: 120s). Use 0 for indefinite stream.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=30,
        help="Concurrent worker connections (default: 30).",
    )
    parser.add_argument(
        "--client-id",
        type=str,
        default="load-generator",
        help="Client identifier for token bucket tracking.",
    )

    args = parser.parse_args()
    base_url = args.url or auto_detect_url()

    try:
        asyncio.run(
            run_streaming_load(
                base_url=base_url,
                rate_per_sec=args.rate,
                duration_secs=args.duration,
                concurrency=args.concurrency,
                client_id=args.client_id,
            )
        )
    except KeyboardInterrupt:
        print("\nShutdown complete.")


if __name__ == "__main__":
    main()
