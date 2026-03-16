"""Analytics credit URL router (referenced separately in config/urls.py)."""
from rest_framework.routers import DefaultRouter

from .views import CreditLedgerViewSet

router = DefaultRouter()
router.register("", CreditLedgerViewSet, basename="credit-ledger-detail")

urlpatterns = router.urls
