"""Message template URL router."""
from rest_framework.routers import DefaultRouter

from .views import MessageTemplateViewSet

router = DefaultRouter()
router.register("", MessageTemplateViewSet, basename="message-template")

urlpatterns = router.urls
