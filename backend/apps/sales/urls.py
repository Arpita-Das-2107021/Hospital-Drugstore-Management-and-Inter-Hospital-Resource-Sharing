"""URL routes for internal sales APIs."""

from django.urls import path

from .views import InternalSaleCollectionAPIView, InternalSaleDetailAPIView, InternalSaleResourceOptionsAPIView

urlpatterns = [
    path("resources/", InternalSaleResourceOptionsAPIView.as_view(), name="internal-sales-resource-options"),
    path("records/", InternalSaleCollectionAPIView.as_view(), name="internal-sales-collection"),
    path("records/<uuid:sale_id>/", InternalSaleDetailAPIView.as_view(), name="internal-sales-detail"),
]
