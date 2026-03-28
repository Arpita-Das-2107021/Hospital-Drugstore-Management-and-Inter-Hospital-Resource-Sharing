"""Requests URL router."""
from rest_framework.routers import DefaultRouter

from .views import ResourceRequestViewSet

router = DefaultRouter()
router.register("", ResourceRequestViewSet, basename="resource-request")

urlpatterns = router.urls
