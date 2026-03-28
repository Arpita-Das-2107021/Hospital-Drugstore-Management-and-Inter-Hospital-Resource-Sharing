from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication


@database_sync_to_async
def get_user_from_token(token: str):
    jwt_auth = JWTAuthentication()
    validated = jwt_auth.get_validated_token(token)
    return jwt_auth.get_user(validated)


class JwtAuthMiddleware(BaseMiddleware):
    """Authenticate websocket connections using JWT from header or query string."""

    async def __call__(self, scope, receive, send):
        scope["user"] = AnonymousUser()

        token = None
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization")
        if auth_header:
            raw = auth_header.decode("utf-8")
            if raw.lower().startswith("bearer "):
                token = raw.split(" ", 1)[1].strip()

        if not token:
            query = parse_qs(scope.get("query_string", b"").decode("utf-8"))
            token = (query.get("token") or [None])[0]

        if token:
            try:
                scope["user"] = await get_user_from_token(token)
            except Exception:
                scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)
