"""Admin hospital update request management URLs — /api/v1/admin/hospital-update-requests/"""
from rest_framework.routers import DefaultRouter

from .views import AdminHospitalUpdateRequestViewSet

router = DefaultRouter()
router.register("", AdminHospitalUpdateRequestViewSet, basename="admin-hospital-update-request")

urlpatterns = router.urls
