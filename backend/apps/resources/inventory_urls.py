"""Resources inventory URL router."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.inventory_module.views import QuickInventoryUpdateAPIView
from .views import ResourceInventoryViewSet, InventoryShareVisibilityView

router = DefaultRouter()
router.register("", ResourceInventoryViewSet, basename="resource-inventory")

urlpatterns = [
    path("quick-update/", QuickInventoryUpdateAPIView.as_view(), name="inventory-quick-update"),
    path("share-visibility/", InventoryShareVisibilityView.as_view(), name="inventory-share-visibility"),
] + router.urls
