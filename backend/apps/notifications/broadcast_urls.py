"""Broadcast URL router."""
from rest_framework.routers import DefaultRouter

from .views import BroadcastMessageViewSet

router = DefaultRouter()
router.register("", BroadcastMessageViewSet, basename="broadcast")

urlpatterns = router.urls
