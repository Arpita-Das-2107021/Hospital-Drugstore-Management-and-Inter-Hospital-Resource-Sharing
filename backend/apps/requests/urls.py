"""Requests URL router."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ResourceRequestViewSet, SSLCommerzWebhookView

router = DefaultRouter()
router.register("", ResourceRequestViewSet, basename="resource-request")

urlpatterns = [
    path("payments/webhooks/sslcommerz/", SSLCommerzWebhookView.as_view(), name="requests-sslcommerz-webhook"),
]
urlpatterns += router.urls
