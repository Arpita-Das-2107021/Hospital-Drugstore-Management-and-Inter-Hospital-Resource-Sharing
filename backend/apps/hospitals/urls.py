"""Hospital URL routers."""
from rest_framework.routers import DefaultRouter

from .views import AdminHospitalRegistrationViewSet, HospitalAPIConfigViewSet, HospitalPartnershipViewSet, HospitalRegistrationRequestView, HospitalViewSet

# Main hospital router
router = DefaultRouter()
router.register("", HospitalViewSet, basename="hospital")

# Public registration router (POST /api/v1/hospital-registration/)
registration_router = DefaultRouter()
registration_router.register("", HospitalRegistrationRequestView, basename="hospital-registration")

# Admin registration management router
admin_registration_router = DefaultRouter()
admin_registration_router.register("", AdminHospitalRegistrationViewSet, basename="admin-hospital-registration")

urlpatterns = router.urls
