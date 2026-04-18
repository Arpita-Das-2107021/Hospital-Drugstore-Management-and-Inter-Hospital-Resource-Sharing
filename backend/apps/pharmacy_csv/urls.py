"""URL patterns for pharmacy CSV ingestion APIs."""
from django.urls import path

from .views import (
    MovementCSVCommitAPIView,
    MovementCSVValidateAPIView,
    PharmacyCSVChatSessionCreateAPIView,
    PharmacyCSVChatSessionMessagesAPIView,
    PharmacyCSVImportJobConflictsAPIView,
    PharmacyCSVImportJobDetailAPIView,
    PharmacyCSVImportJobErrorsAPIView,
    SalesCSVCommitAPIView,
    SalesCSVValidateAPIView,
    StaffCSVCommitAPIView,
    StaffCSVValidateAPIView,
)

urlpatterns = [
    path("sales/imports/validate/", SalesCSVValidateAPIView.as_view(), name="pharmacy-csv-sales-validate"),
    path("sales/imports/commit/", SalesCSVCommitAPIView.as_view(), name="pharmacy-csv-sales-commit"),
    path("staff/imports/validate/", StaffCSVValidateAPIView.as_view(), name="pharmacy-csv-staff-validate"),
    path("staff/imports/commit/", StaffCSVCommitAPIView.as_view(), name="pharmacy-csv-staff-commit"),
    path("movements/imports/validate/", MovementCSVValidateAPIView.as_view(), name="pharmacy-csv-movements-validate"),
    path("movements/imports/commit/", MovementCSVCommitAPIView.as_view(), name="pharmacy-csv-movements-commit"),
    path("chat/sessions/", PharmacyCSVChatSessionCreateAPIView.as_view(), name="pharmacy-csv-chat-session-create"),
    path(
        "chat/sessions/<uuid:session_id>/messages/",
        PharmacyCSVChatSessionMessagesAPIView.as_view(),
        name="pharmacy-csv-chat-session-messages",
    ),
    path("imports/<uuid:job_id>/", PharmacyCSVImportJobDetailAPIView.as_view(), name="pharmacy-csv-import-job"),
    path(
        "imports/<uuid:job_id>/errors/",
        PharmacyCSVImportJobErrorsAPIView.as_view(),
        name="pharmacy-csv-import-job-errors",
    ),
    path(
        "imports/<uuid:job_id>/conflicts/",
        PharmacyCSVImportJobConflictsAPIView.as_view(),
        name="pharmacy-csv-import-job-conflicts",
    ),
]
