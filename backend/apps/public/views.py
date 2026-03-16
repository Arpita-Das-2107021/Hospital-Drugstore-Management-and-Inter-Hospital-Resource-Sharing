"""Public views — unauthenticated endpoints."""
import logging

from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.utils.response import success_response, error_response

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """
    GET /api/health/
    Returns 200 if the service is healthy, 503 if degraded.
    Used by Docker health checks and load balancers.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        checks = {}

        # Database check
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            checks["database"] = "ok"
        except Exception as e:
            logger.error("Health check — DB failure: %s", e)
            checks["database"] = "error"

        # Redis check
        try:
            from django.core.cache import cache
            cache.set("_health", "1", timeout=5)
            assert cache.get("_health") == "1"
            checks["cache"] = "ok"
        except Exception as e:
            logger.error("Health check — cache failure: %s", e)
            checks["cache"] = "error"

        all_ok = all(v == "ok" for v in checks.values())
        status_code = 200 if all_ok else 503

        if all_ok:
            return Response(success_response(data={"status": "healthy", "checks": checks}), status=200)
        return Response(
            error_response("service_degraded", "One or more services are degraded.", details=checks),
            status=503,
        )


class PlatformInfoView(APIView):
    """GET /api/public/ — public platform metadata (no auth required)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            success_response(
                data={
                    "name": "Hospital Resource Sharing Platform",
                    "version": "1.0.0",
                    "description": "API for inter-hospital resource sharing and logistics.",
                }
            )
        )
