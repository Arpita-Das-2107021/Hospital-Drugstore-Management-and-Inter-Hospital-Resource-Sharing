from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request

app = FastAPI(title="Server A Callback Mock", version="1.0.0")

EVENTS_FILE = Path(os.getenv("CALLBACK_EVENTS_FILE", "/tmp/server_a_callback_events.jsonl"))


def _append_event(payload: dict) -> None:
    EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS_FILE.open("a", encoding="utf-8") as file_obj:
        file_obj.write(json.dumps(payload, sort_keys=True) + "\n")


def _read_events() -> list[dict]:
    if not EVENTS_FILE.exists():
        return []

    rows: list[dict] = []
    with EVENTS_FILE.open("r", encoding="utf-8") as file_obj:
        for line in file_obj:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


@app.post("/api/v1/ml/callbacks/server-b/")
async def receive_callback(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {"raw": (await request.body()).decode("utf-8", errors="replace")}

    event = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "headers": {
            "x-signature": request.headers.get("x-signature"),
            "x-timestamp": request.headers.get("x-timestamp"),
            "x-request-id": request.headers.get("x-request-id"),
            "content-type": request.headers.get("content-type"),
        },
        "body": body,
    }
    _append_event(event)
    return {"accepted": True}


@app.get("/events")
def list_events() -> dict:
    events = _read_events()
    return {"count": len(events), "events": events}


@app.delete("/events")
def clear_events() -> dict:
    if EVENTS_FILE.exists():
        EVENTS_FILE.unlink()
    return {"cleared": True}
