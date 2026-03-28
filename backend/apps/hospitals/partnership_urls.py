"""Hospital partnership URL router."""
from rest_framework.routers import DefaultRouter

from .views import HospitalPartnershipViewSet

router = DefaultRouter()
router.register("", HospitalPartnershipViewSet, basename="hospital-partnership")

urlpatterns = router.urls
