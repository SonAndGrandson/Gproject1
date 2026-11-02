import os
import psycopg

from tasks import demo_task, check_monitor
from url_safety import UnsafeTarget, validate_url
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, HttpUrl, Field
from psycopg.rows import dict_row


app = FastAPI()


class MonitorCreate(BaseModel):
    url: HttpUrl
    interval_seconds: int = Field(ge=30, le=3600)
    is_active: bool = True


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/monitors")
def get_monitors():
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, url, interval_seconds, is_active
                FROM monitors
                ORDER BY id;
            """)
            monitors = cur.fetchall()

    return monitors


@app.post("/monitors", status_code=201)
def create_monitor(monitor: MonitorCreate):
    if len(str(monitor.url)) > 255:
        raise HTTPException(status_code=422, detail="URL must be 255 characters or fewer")
    try:
        validate_url(str(monitor.url))
    except UnsafeTarget as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO monitors
                    (url, interval_seconds, is_active)
                VALUES (%s, %s, %s)
                RETURNING id, url, interval_seconds, is_active;
            """, (
                str(monitor.url),
                monitor.interval_seconds,
                monitor.is_active
            ))
            new_monitor = cur.fetchone()

    return new_monitor


@app.get("/monitors/{monitor_id}")
def get_monitor(monitor_id: int):
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, url, interval_seconds, is_active
                FROM monitors
                WHERE id = %s;
            """, (monitor_id,))
            monitor = cur.fetchone()

    if monitor is None:
        raise HTTPException(
            status_code=404,
            detail="Monitor not found"
        )

    return monitor


@app.get("/monitors/{monitor_id}/checks")
def get_monitor_checks(
    monitor_id: int,
    limit: int = Query(default=100, ge=1, le=500)
):
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id
                FROM monitors
                WHERE id = %s;
            """, (monitor_id,))

            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=404,
                    detail="Monitor not found"
                )

            cur.execute("""
                SELECT
                    id,
                    monitor_id,
                    status_code,
                    is_up,
                    response_time_ms,
                    error_message,
                    checked_at
                FROM res_checking
                WHERE monitor_id = %s
                ORDER BY checked_at DESC, id DESC
                LIMIT %s;
            """, (monitor_id, limit))

            checks = cur.fetchall()

    return checks


@app.post("/tasks/demo", status_code=202)
def run_demo_task():
    task = demo_task.delay()

    return {
        "task_id": task.id,
        "message": "Task queued"
    }

@app.post("/monitors/{monitor_id}/check", status_code=202)
def request_monitor_check(monitor_id: int):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT is_active FROM monitors WHERE id = %s", (monitor_id,))
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Monitor not found")
    if not row[0]:
        raise HTTPException(status_code=409, detail="Monitor is inactive")
    task = check_monitor.delay(monitor_id)

    return {
        "task_id": task.id,
        "message": "Website check queued"
    }


from monitor_mutations import router as monitor_mutations_router

app.include_router(monitor_mutations_router)