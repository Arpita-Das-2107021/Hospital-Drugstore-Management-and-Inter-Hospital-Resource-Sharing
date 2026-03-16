"""Analytics app views."""
import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import viewsets

from common.permissions.base import IsSuperAdmin
from common.utils.pagination import StandardResultsPagination
from common.utils.response import success_response

from .models import CreditLedger
from .serializers import CreditLedgerSerializer
from .services import get_hospital_balance

logger = logging.getLogger("hrsp.analytics")


class CreditLedgerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CreditLedgerSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        user = self.request.user
        if user.roles.filter(name="SUPER_ADMIN").exists():
            return CreditLedger.objects.select_related("hospital").all()
        if hasattr(user, "staff") and user.staff:
            return CreditLedger.objects.filter(hospital=user.staff.hospital).order_by("-created_at")
        return CreditLedger.objects.none()

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(success_response(data=self.get_serializer(qs, many=True).data))

    def retrieve(self, request, *args, **kwargs):
        return Response(success_response(data=self.get_serializer(self.get_object()).data))


class HospitalBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        hospital = request.user.staff.hospital if hasattr(request.user, "staff") and request.user.staff else None
        if not hospital:
            return Response(success_response(data={"balance": 0, "hospital": None}))
        balance = get_hospital_balance(hospital)
        return Response(success_response(data={"balance": balance, "hospital_id": str(hospital.id)}))
