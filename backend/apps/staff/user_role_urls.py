"""User role and effective permission URL patterns."""
from django.urls import path

from .views import UserEffectivePermissionsView, UserRoleViewSet

user_role_list = UserRoleViewSet.as_view({"get": "list", "post": "create"})
user_role_detail = UserRoleViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("<uuid:user_pk>/roles/", user_role_list, name="user-role-list"),
    path("<uuid:user_pk>/roles/<uuid:pk>/", user_role_detail, name="user-role-detail"),
    path(
        "<uuid:user_pk>/permissions/effective/",
        UserEffectivePermissionsView.as_view(),
        name="user-effective-permissions",
    ),
]
