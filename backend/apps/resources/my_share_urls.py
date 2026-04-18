"""Tenant-scoped resource share URL router."""
from django.urls import path

from .views import MyResourceShareListView

urlpatterns = [
    path("", MyResourceShareListView.as_view(), name="my-resource-shares"),
]
