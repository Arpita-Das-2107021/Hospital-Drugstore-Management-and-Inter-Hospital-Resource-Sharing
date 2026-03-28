"""Authentication views — thin, delegate to services."""
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from common.utils.response import error_response, success_response
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResetPasswordSerializer,
    ResetPasswordValidateQuerySerializer,
    UserProfileSerializer,
)
from .services import (
    PasswordResetFlowError,
    change_password,
    confirm_password_reset,
    initiate_password_reset,
    logout_user,
    validate_password_reset_token,
)


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class LoginView(TokenObtainPairView):
    """POST /api/auth/login — returns JWT + user profile."""

    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            response.data = success_response(data=response.data)
        return response


class RefreshTokenView(TokenRefreshView):
    """POST /api/auth/refresh — obtain new access token."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            response.data = success_response(data=response.data)
        return response


class LogoutView(APIView):
    """POST /api/auth/logout — blacklist refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        logout_user(serializer.validated_data["refresh"])
        return Response(success_response(data={"detail": "Successfully logged out."}))


class MeView(APIView):
    """GET /api/auth/me — return current user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(success_response(data=serializer.data))


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset — request a password reset email."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        initiate_password_reset(serializer.validated_data["email"])
        # Always return 200 to prevent email enumeration
        return Response(
            success_response(data={"detail": "If that email is registered, a reset link has been sent."})
        )


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm — consume token and set new password."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            confirm_password_reset(
                serializer.validated_data["token"],
                serializer.validated_data["new_password"],
            )
        except PasswordResetFlowError:
            return Response(
                error_response(
                    code="validation_error",
                    message="Invalid or expired token",
                    details={},
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(success_response(data={"detail": "Password reset successful."}))


class ChangePasswordView(APIView):
    """POST /api/auth/change-password — change own password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        change_password(
            request.user,
            serializer.validated_data["current_password"],
            serializer.validated_data["new_password"],
        )
        return Response(success_response(data={"detail": "Password updated successfully."}))


class ResetPasswordValidateView(APIView):
    """GET /api/auth/reset-password/validate?token=xxx - validate reset token state."""

    permission_classes = [AllowAny]

    def get(self, request):
        serializer = ResetPasswordValidateQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            validate_password_reset_token(serializer.validated_data["token"])
        except PasswordResetFlowError as exc:
            return Response(
                {
                    "success": False,
                    "data": None,
                    "error": {"code": exc.code, "message": exc.message, "details": {}},
                    "meta": {},
                },
                status=exc.status_code,
            )

        return Response(success_response(data={"valid": True}))


class ResetPasswordView(APIView):
    """POST /api/auth/reset-password - consume token and set new password."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            validate_password_reset_token(serializer.validated_data["token"])
        except PasswordResetFlowError as exc:
            return Response(
                {
                    "success": False,
                    "data": None,
                    "error": {"code": exc.code, "message": exc.message, "details": {}},
                    "meta": {},
                },
                status=exc.status_code,
            )

        confirm_password_reset(
            serializer.validated_data["token"],
            serializer.validated_data["newPassword"],
        )

        return Response(success_response(data={"detail": "Password reset successful."}))
