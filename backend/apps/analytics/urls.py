"""Analytics URL router."""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CreditLedgerViewSet, HospitalBalanceView

router = DefaultRouter()
router.register("credits", CreditLedgerViewSet, basename="credit-ledger")

urlpatterns = [
    path("balance/", HospitalBalanceView.as_view(), name="hospital-balance"),
    *router.urls,
]
