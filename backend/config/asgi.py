"""ASGI config for HRSP project with Channels websocket routing."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

# Import application components that may import app models only after
# Django has had a chance to configure apps via get_asgi_application().
django_asgi_app = get_asgi_application()

from apps.chat.middleware import JwtAuthMiddlewareStack  # noqa: E402
from apps.chat.routing import websocket_urlpatterns as chat_websocket_urlpatterns  # noqa: E402
from apps.notifications.routing import websocket_urlpatterns as broadcast_websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JwtAuthMiddlewareStack(
            URLRouter([
                *chat_websocket_urlpatterns,
                *broadcast_websocket_urlpatterns,
            ])
        ),
    }
)
