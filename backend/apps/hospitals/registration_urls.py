"""Public hospital registration URL — POST /api/v1/hospital-registration/"""
from rest_framework.routers import DefaultRouter

from .views import HospitalRegistrationRequestView

router = DefaultRouter()
router.register("", HospitalRegistrationRequestView, basename="hospital-registration")

urlpatterns = router.urls
