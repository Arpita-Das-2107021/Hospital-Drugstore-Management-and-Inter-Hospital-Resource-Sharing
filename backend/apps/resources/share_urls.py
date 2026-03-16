"""Resources share URL router."""
from rest_framework.routers import DefaultRouter

from .views import ResourceShareViewSet

router = DefaultRouter()
router.register("", ResourceShareViewSet, basename="resource-share")

urlpatterns = router.urls
