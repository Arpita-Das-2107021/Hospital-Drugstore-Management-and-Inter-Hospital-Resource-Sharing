"""Badge polling API views."""

from __future__ import annotations

from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions.base import RequireHealthcareContext, RequirePlatformContext
from common.permissions.runtime import has_any_permission

from .events import HospitalUpdateDecisionViewedEvent, RequestDecisionViewedEvent
from .publisher import publish_badge_event
from .services import HealthcareBadgeQueryService, PlatformBadgeQueryService


def _resolve_hospital_id_from_request(request) -> str | None:
    token = getattr(request, "auth", None)
    if token is not None:
        token_hospital_id = token.get("hospital_id") if hasattr(token, "get") else None
        if token_hospital_id:
            return str(token_hospital_id)

    # Fallback keeps force-authenticated tests and internal callers operational.
    resolver = getattr(request.user, "get_hospital_id", None)
    fallback_hospital_id = resolver() if callable(resolver) else None
    if fallback_hospital_id:
        return str(fallback_hospital_id)
    return None


def _assert_healthcare_badge_access(request, hospital_id: str) -> None:
    user_hospital_id = request.user.get_hospital_id() if hasattr(request.user, "get_hospital_id") else None
    if user_hospital_id and str(user_hospital_id) != str(hospital_id):
        raise PermissionDenied("Cross-tenant badge access is forbidden.")

    if not has_any_permission(
        request.user,
        (
            "hospital:request.view",
            "hospital:request.approve",
            "hospital:hospital.update",
            "share.request.create",
            "share.request.approve",
        ),
        hospital_id=hospital_id,
        allow_role_fallback=False,
    ):
        raise PermissionDenied("You do not have permission to view healthcare badges.")


def _normalize_id_list(payload, field_name: str) -> list[str]:
    if payload is None:
        return []

    if not isinstance(payload, list):
        raise ValidationError({field_name: "Must be an array of IDs."})

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in payload:
        value = str(raw or "").strip()
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


class HealthcareBadgesAPIView(APIView):
    permission_classes = [IsAuthenticated, RequireHealthcareContext]
    query_service = HealthcareBadgeQueryService()

    def get(self, request):
        hospital_id = _resolve_hospital_id_from_request(request)
        if not hospital_id:
            raise PermissionDenied("Missing healthcare context hospital_id.")

        _assert_healthcare_badge_access(request, hospital_id)

        return Response(self.query_service.get_badges(hospital_id, user=request.user))


class HealthcareBadgeAcknowledgeAPIView(APIView):
    permission_classes = [IsAuthenticated, RequireHealthcareContext]

    def post(self, request):
        hospital_id = _resolve_hospital_id_from_request(request)
        if not hospital_id:
            raise PermissionDenied("Missing healthcare context hospital_id.")

        _assert_healthcare_badge_access(request, hospital_id)

        request_ids = _normalize_id_list(request.data.get("requestDecisionIds"), "requestDecisionIds")
        update_ids = _normalize_id_list(request.data.get("updateDecisionIds"), "updateDecisionIds")

        for request_id in request_ids:
            publish_badge_event(
                RequestDecisionViewedEvent(
                    event_id=f"request-decision-viewed:{hospital_id}:{request_id}",
                    request_id=request_id,
                    requesting_hospital_id=hospital_id,
                )
            )

        for update_request_id in update_ids:
            publish_badge_event(
                HospitalUpdateDecisionViewedEvent(
                    event_id=f"hospital-update-decision-viewed:{hospital_id}:{update_request_id}",
                    update_request_id=update_request_id,
                    hospital_id=hospital_id,
                )
            )

        return Response(
            {
                "markedRequestDecisions": len(request_ids),
                "markedUpdateApprovals": len(update_ids),
            }
        )


class PlatformBadgesAPIView(APIView):
    permission_classes = [IsAuthenticated, RequirePlatformContext]
    query_service = PlatformBadgeQueryService()

    def get(self, request):
        if not has_any_permission(
            request.user,
            (
                "platform:hospital.manage",
                "platform:hospital.update.review",
                "platform:hospital.offboarding.review",
            ),
            allow_role_fallback=False,
        ):
            raise PermissionDenied("You do not have permission to view platform badges.")

        return Response(self.query_service.get_badges(user=request.user))
