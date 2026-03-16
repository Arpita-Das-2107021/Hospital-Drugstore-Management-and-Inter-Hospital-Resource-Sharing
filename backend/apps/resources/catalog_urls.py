"""Resources catalog URL router."""
from rest_framework.routers import DefaultRouter

from .views import ResourceCatalogViewSet, ResourceTypeViewSet

router = DefaultRouter()
router.register("types", ResourceTypeViewSet, basename="resource-type")
router.register("", ResourceCatalogViewSet, basename="resource-catalog")

urlpatterns = router.urls
