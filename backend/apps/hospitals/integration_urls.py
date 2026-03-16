"""Integration API config URL router."""
from rest_framework.routers import DefaultRouter

from .views import HospitalAPIConfigViewSet

router = DefaultRouter()
router.register("", HospitalAPIConfigViewSet, basename="hospital-api-config")

urlpatterns = router.urls
