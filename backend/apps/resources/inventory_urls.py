"""Resources inventory URL router."""
from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import ResourceInventoryViewSet, InventoryShareVisibilityView

router = DefaultRouter()
router.register("", ResourceInventoryViewSet, basename="resource-inventory")

urlpatterns = [
    path("share-visibility/", InventoryShareVisibilityView.as_view(), name="inventory-share-visibility"),
] + router.urls
