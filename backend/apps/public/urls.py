"""Public URL patterns."""
from django.urls import path

from .views import PlatformInfoView

urlpatterns = [
    path("", PlatformInfoView.as_view(), name="platform-info"),
]
