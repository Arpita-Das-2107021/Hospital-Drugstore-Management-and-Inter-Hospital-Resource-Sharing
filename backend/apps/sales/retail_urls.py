"""URL routes for retail sales APIs."""

from django.urls import path

from .views import RetailSaleCollectionAPIView, RetailSaleDetailAPIView

urlpatterns = [
    path("", RetailSaleCollectionAPIView.as_view(), name="retail-sales-collection"),
    path("<uuid:sale_id>/", RetailSaleDetailAPIView.as_view(), name="retail-sales-detail"),
]
