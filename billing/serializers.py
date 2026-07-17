from decimal import Decimal

from rest_framework import serializers

from billing.models import CreditAccount, LedgerEntry


class CreditAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditAccount
        fields = ("balance", "updated_at")


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ("amount", "reason", "balance_after", "created_at")


class SandboxTopupSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal("0.01"), max_value=Decimal("100000")
    )
