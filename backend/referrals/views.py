from decimal import Decimal

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from referrals.models import Referral
from referrals.serializers import ReferralStatsSerializer
from referrals.services import referral_code_for, referral_link_for


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def referral_stats(request):
    made = Referral.objects.filter(referrer=request.user)
    data = {
        "referral_link": referral_link_for(request.user),
        "referral_code": referral_code_for(request.user),
        "referred_count": made.count(),
        "rewarded_count": made.filter(status=Referral.Status.REWARDED).count(),
        "reward_credits": Decimal(str(settings.REFERRAL_REWARD_CREDITS)),
    }
    return Response(ReferralStatsSerializer(data).data)
