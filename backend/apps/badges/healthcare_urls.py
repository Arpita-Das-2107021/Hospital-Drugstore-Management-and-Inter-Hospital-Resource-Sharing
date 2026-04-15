"""Healthcare badge endpoint routes."""

from django.urls import path

from .views import HealthcareBadgeAcknowledgeAPIView, HealthcareBadgesAPIView


urlpatterns = [
    path("badges", HealthcareBadgesAPIView.as_view(), name="healthcare-badges"),
    path("badges/", HealthcareBadgesAPIView.as_view(), name="healthcare-badges-slash"),
    path("badges/acknowledge", HealthcareBadgeAcknowledgeAPIView.as_view(), name="healthcare-badges-acknowledge"),
    path(
        "badges/acknowledge/",
        HealthcareBadgeAcknowledgeAPIView.as_view(),
        name="healthcare-badges-acknowledge-slash",
    ),
]
