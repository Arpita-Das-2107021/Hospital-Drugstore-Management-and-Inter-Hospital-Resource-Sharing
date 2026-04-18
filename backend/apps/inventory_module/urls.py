"""Inventory module URL patterns."""
from django.urls import path

from .views import (
    InventoryCSVCommitAPIView,
    InventoryCSVDiscountCommitAPIView,
    InventoryCSVValidateAPIView,
    InventoryImportJobDetailAPIView,
    InventoryImportJobErrorsAPIView,
    QuickInventoryUpdateAPIView,
)

urlpatterns = [
    path("quick-update/", QuickInventoryUpdateAPIView.as_view(), name="inventory-module-quick-update"),
    path("imports/validate/", InventoryCSVValidateAPIView.as_view(), name="inventory-module-import-validate"),
    path("imports/commit/", InventoryCSVCommitAPIView.as_view(), name="inventory-module-import-commit"),
    path(
        "imports/discounts/commit/",
        InventoryCSVDiscountCommitAPIView.as_view(),
        name="inventory-module-import-discount-commit",
    ),
    path("imports/<uuid:job_id>/", InventoryImportJobDetailAPIView.as_view(), name="inventory-module-import-job"),
    path(
        "imports/<uuid:job_id>/errors/",
        InventoryImportJobErrorsAPIView.as_view(),
        name="inventory-module-import-job-errors",
    ),
]
