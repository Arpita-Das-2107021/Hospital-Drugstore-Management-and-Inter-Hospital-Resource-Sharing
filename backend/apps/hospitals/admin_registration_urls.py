"""Admin hospital registration management URLs — /api/v1/admin/hospital-registrations/"""
from rest_framework.routers import DefaultRouter

from .views import AdminHospitalRegistrationViewSet

router = DefaultRouter()
router.register("", AdminHospitalRegistrationViewSet, basename="admin-hospital-registration")

urlpatterns = router.urls
