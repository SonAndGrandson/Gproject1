import asyncio
import os
import time

import aiohttp
import psycopg
from celery import Celery

from url_safety import PublicResolver, UnsafeTarget, validate_url

celery_app = Celery("uptime_monitor", broker=os.environ["REDIS_URL"])


@celery_app.task
def demo_task():
    return "done"


async def get_status(url: str) -> int:
    validate_url(url)
    connector = aiohttp.TCPConnector(resolver=PublicResolver(), use_dns_cache=False)
    timeout = aiohttp.ClientTimeout(total=5)
    async with aiohttp.ClientSession(
        connector=connector, timeout=timeout, trust_env=False
    ) as session:
        async with session.get(url, allow_redirects=False) as response:
            return response.status


@celery_app.task
def check_monitor(monitor_id: int):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_xact_lock(8125, %s::integer)", (monitor_id,))
            if not cur.fetchone()[0]:
                return {"monitor_id": monitor_id, "skipped": "already_running"}

            cur.execute("""
                SELECT m.url, m.is_active,
                       NOT EXISTS (
                           SELECT 1 FROM res_checking c
                           WHERE c.monitor_id = m.id
                             AND c.checked_at > NOW() - (m.interval_seconds * INTERVAL '1 second')
                       ) AS is_due
                FROM monitors m
                WHERE m.id = %s
            """, (monitor_id,))
            monitor = cur.fetchone()

            if monitor is None or not monitor[1]:
                return {"monitor_id": monitor_id, "skipped": "not_active"}

            url, _, is_due = monitor
            if not is_due:
                return {"monitor_id": monitor_id, "skipped": "not_due"}

            started = time.perf_counter()
            try:
                status_code = asyncio.run(get_status(url))
                is_up = 200 <= status_code < 400
                response_time_ms = round((time.perf_counter() - started) * 1000)
                error_message = None
            except (aiohttp.ClientError, OSError, TimeoutError, ValueError) as error:
                status_code = None
                is_up = False
                response_time_ms = None
                error_message = type(error).__name__

            cur.execute(
                "SELECT url, is_active FROM monitors WHERE id = %s FOR UPDATE",
                (monitor_id,)
            )
            current = cur.fetchone()
            if current is None or not current[1] or current[0] != url:
                return {"monitor_id": monitor_id, "skipped": "changed_or_deleted"}

            cur.execute("""
                INSERT INTO res_checking
                    (monitor_id, status_code, is_up, response_time_ms, error_message)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (monitor_id, status_code, is_up, response_time_ms, error_message))
            check_id = cur.fetchone()[0]

    result = {
        "check_id": check_id,
        "monitor_id": monitor_id,
        "status_code": status_code,
        "is_up": is_up,
        "response_time_ms": response_time_ms,
        "error_message": error_message,
    }
    print(result, flush=True)
    return result


@celery_app.task
def dispatch_monitors():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT m.id
                FROM monitors m
                WHERE m.is_active
                  AND NOT EXISTS (
                      SELECT 1 FROM res_checking c
                      WHERE c.monitor_id = m.id
                        AND c.checked_at > NOW() - (m.interval_seconds * INTERVAL '1 second')
                  )
                ORDER BY m.id
            """)
            monitor_ids = [row[0] for row in cur.fetchall()]

    for monitor_id in monitor_ids:
        check_monitor.delay(monitor_id)

    return {"queued": len(monitor_ids)}


celery_app.conf.beat_schedule = {
    "dispatch-monitors-every-10-seconds": {
        "task": "tasks.dispatch_monitors",
        "schedule": 10.0,
    }
}
