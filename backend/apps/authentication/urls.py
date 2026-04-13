"""Authentication URL configuration."""
from django.urls import path

from .views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    UserProfilePictureView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ResetPasswordValidateView,
    ResetPasswordView,
    RefreshTokenView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", RefreshTokenView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("me/profile-picture/", UserProfilePictureView.as_view(), name="auth-me-profile-picture"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("reset-password/validate", ResetPasswordValidateView.as_view(), name="auth-reset-password-validate"),
    path("reset-password", ResetPasswordView.as_view(), name="auth-reset-password"),
]
