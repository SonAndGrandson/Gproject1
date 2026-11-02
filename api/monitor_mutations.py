import os

import psycopg
from fastapi import APIRouter, HTTPException, Response
from psycopg.rows import dict_row
from pydantic import BaseModel, HttpUrl

from url_safety import UnsafeTarget, validate_url

router = APIRouter()


class MonitorUrlUpdate(BaseModel):
    url: HttpUrl


@router.patch("/monitors/{monitor_id}")
def update_monitor_url(monitor_id: int, payload: MonitorUrlUpdate):
    new_url = str(payload.url)
    if len(new_url) > 255:
        raise HTTPException(status_code=422, detail="URL must be 255 characters or fewer")
    try:
        validate_url(new_url)
    except UnsafeTarget as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT url
                FROM monitors
                WHERE id = %s
                FOR UPDATE;
            """, (monitor_id,))
            current = cur.fetchone()
            if current is None:
                raise HTTPException(status_code=404, detail="Monitor not found")

            if current["url"] != new_url:
                cur.execute("""
                    UPDATE monitors
                    SET url = %s
                    WHERE id = %s;
                """, (new_url, monitor_id))
                cur.execute("""
                    DELETE FROM res_checking
                    WHERE monitor_id = %s;
                """, (monitor_id,))

            cur.execute("""
                SELECT id, url, interval_seconds, is_active
                FROM monitors
                WHERE id = %s;
            """, (monitor_id,))
            updated = cur.fetchone()

    return updated


@router.delete("/monitors/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: int):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM monitors
                WHERE id = %s
                RETURNING id;
            """, (monitor_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Monitor not found")
    return Response(status_code=204)
