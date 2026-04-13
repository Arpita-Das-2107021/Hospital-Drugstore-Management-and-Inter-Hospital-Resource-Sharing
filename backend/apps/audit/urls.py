"""Audit log URL router."""
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, AuthorizationAuditLogViewSet

router = DefaultRouter()
router.register("authorization", AuthorizationAuditLogViewSet, basename="authorization-audit-log")
router.register("", AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls
