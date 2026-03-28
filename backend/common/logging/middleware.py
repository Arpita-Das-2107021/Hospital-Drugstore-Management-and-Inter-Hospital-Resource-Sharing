"""Request logging middleware and JSON log formatter."""
import json
import logging
import time
import uuid

logger = logging.getLogger("hrsp.requests")


class RequestLoggingMiddleware:
    """Logs every HTTP request with method, path, status code and duration."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = str(uuid.uuid4())
        request.request_id = request_id
        start = time.monotonic()

        response = self.get_response(request)

        duration_ms = round((time.monotonic() - start) * 1000, 2)
        user_id = None
        if hasattr(request, "user") and request.user.is_authenticated:
            user_id = str(request.user.id)

        logger.info(
            "HTTP request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "user_id": user_id,
                "ip": _get_client_ip(request),
            },
        )
        return response


class AuditMiddleware:
    """Attaches request metadata to the request for use by audit services."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.audit_ip = _get_client_ip(request)
        request.audit_user_agent = request.META.get("HTTP_USER_AGENT", "")
        return self.get_response(request)


class JsonFormatter(logging.Formatter):
    """Formats log records as a single JSON line."""

    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge any extra fields attached via logger.info("msg", extra={...})
        for key, value in record.__dict__.items():
            if key not in (
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
                "taskName",
            ):
                try:
                    json.dumps({key: value})
                    log_entry[key] = value
                except (TypeError, ValueError):
                    log_entry[key] = str(value)
        if record.exc_info:
            log_entry["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


def _get_client_ip(request) -> str:
    """Extract real client IP, accounting for reverse proxy headers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        # Take only the first (leftmost) IP — the original client
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
