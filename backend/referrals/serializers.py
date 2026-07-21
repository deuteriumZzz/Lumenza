from rest_framework import serializers


class ReferralStatsSerializer(serializers.Serializer):
    referral_link = serializers.CharField()
    referral_code = serializers.CharField()
    referred_count = serializers.IntegerField()
    rewarded_count = serializers.IntegerField()
    reward_credits = serializers.DecimalField(max_digits=12, decimal_places=4)
