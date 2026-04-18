"""Analytics URL router."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CreditLedgerViewSet, HospitalBalanceView, PlatformAnalyticsSummaryView

router = DefaultRouter()
router.register("credits", CreditLedgerViewSet, basename="credit-ledger")

urlpatterns = [
    path("balance/", HospitalBalanceView.as_view(), name="hospital-balance"),
    path("platform-summary/", PlatformAnalyticsSummaryView.as_view(), name="platform-analytics-summary"),
    *router.urls,
]
