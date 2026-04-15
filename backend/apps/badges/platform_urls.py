"""Platform badge endpoint routes."""

from django.urls import path

from .views import PlatformBadgesAPIView


urlpatterns = [
    path("badges", PlatformBadgesAPIView.as_view(), name="platform-badges"),
    path("badges/", PlatformBadgesAPIView.as_view(), name="platform-badges-slash"),
]
