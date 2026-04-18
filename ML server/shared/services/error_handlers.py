from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _json_safe(value):
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]

    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def register_validation_error_handler(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_, exc: RequestValidationError) -> JSONResponse:
        details = _json_safe(exc.errors())
        return JSONResponse(
            status_code=422,
            content={
                "accepted": False,
                "error": {
                    "code": "validation_error",
                    "message": "Invalid request",
                    "details": details,
                },
            },
        )
