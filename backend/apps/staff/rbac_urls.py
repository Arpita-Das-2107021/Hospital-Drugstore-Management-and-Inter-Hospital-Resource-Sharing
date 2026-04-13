"""Dual-scope RBAC URL configuration."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .rbac_views import (
    HospitalRoleViewSet,
    PlatformRoleViewSet,
    UserEffectivePermissionsV2View,
    UserHospitalRoleView,
    UserPlatformRoleViewSet,
)

router = DefaultRouter()
router.register("platform-roles", PlatformRoleViewSet, basename="platform-role-v2")
router.register("hospital-roles", HospitalRoleViewSet, basename="hospital-role-v2")

user_platform_roles = UserPlatformRoleViewSet.as_view({"get": "list", "post": "create"})
user_platform_role_detail = UserPlatformRoleViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("users/<uuid:user_pk>/platform-roles/", user_platform_roles, name="user-platform-roles"),
    path(
        "users/<uuid:user_pk>/platform-roles/<uuid:pk>/",
        user_platform_role_detail,
        name="user-platform-role-detail",
    ),
    path("users/<uuid:user_pk>/hospital-role/", UserHospitalRoleView.as_view(), name="user-hospital-role"),
    path(
        "users/<uuid:user_pk>/permissions/effective/",
        UserEffectivePermissionsV2View.as_view(),
        name="user-effective-permissions-v2",
    ),
    *router.urls,
]
