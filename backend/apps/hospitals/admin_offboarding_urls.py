"""Admin hospital offboarding management URLs — /api/v1/admin/hospital-offboarding-requests/"""
from rest_framework.routers import DefaultRouter

from .views import AdminHospitalOffboardingRequestViewSet

router = DefaultRouter()
router.register("", AdminHospitalOffboardingRequestViewSet, basename="admin-hospital-offboarding-request")

urlpatterns = router.urls
