"""Invitation URL patterns."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AcceptInvitationView, InvitationViewSet

router = DefaultRouter()
router.register("", InvitationViewSet, basename="invitation")

urlpatterns = [
    path("accept/", AcceptInvitationView.as_view(), name="invitation-accept"),
    *router.urls,
]
