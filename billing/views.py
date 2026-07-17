from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry
from billing.serializers import CreditAccountSerializer, SandboxTopupSerializer
from billing.services import get_or_create_account, grant_credits
from billing.throttling import SandboxTopupRateThrottle


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def balance(request):
    account = get_or_create_account(request.user)
    return Response(CreditAccountSerializer(account).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([SandboxTopupRateThrottle])
def sandbox_topup(request):
    # Stub top-up for local/dev use only, ahead of the real YooKassa
    # integration (Phase 6). Never enable outside DEBUG — this mints
    # credits with no payment behind them. Throttled independently of the
    # enable flag: even an intentionally-enabled sandbox shouldn't let one
    # account mint unlimited credits in a tight loop.
    if not settings.SANDBOX_TOPUP_ENABLED:
        return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    serializer = SandboxTopupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    account = grant_credits(
        request.user, serializer.validated_data["amount"], reason=LedgerEntry.Reason.TOPUP
    )
    return Response(CreditAccountSerializer(account).data, status=status.HTTP_201_CREATED)
