"""Admin hospital registration management URLs — /api/v1/admin/hospital-registrations/"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AdminHospitalRegistrationViewSet

router = DefaultRouter()
router.register("", AdminHospitalRegistrationViewSet, basename="admin-hospital-registration")

urlpatterns = router.urls + [
	# Optional no-trailing-slash aliases to prevent APPEND_SLASH POST RuntimeError in debug mode.
	path("<uuid:pk>/approve", AdminHospitalRegistrationViewSet.as_view({"post": "approve"})),
	path("<uuid:pk>/reject", AdminHospitalRegistrationViewSet.as_view({"post": "reject"})),
	path("<uuid:pk>/send-review-email", AdminHospitalRegistrationViewSet.as_view({"post": "send_review_email"})),
	path("<uuid:pk>/review-email-history", AdminHospitalRegistrationViewSet.as_view({"get": "review_email_history"})),
	path("<uuid:pk>/check-api", AdminHospitalRegistrationViewSet.as_view({"post": "check_api"})),
	path("<uuid:pk>/check-api/<str:api_name>", AdminHospitalRegistrationViewSet.as_view({"post": "check_single_api"})),
	path("<uuid:pk>/api-check-results", AdminHospitalRegistrationViewSet.as_view({"get": "api_check_results"})),
]
