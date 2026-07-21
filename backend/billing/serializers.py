from decimal import Decimal

from rest_framework import serializers

from billing.models import CreditAccount, LedgerEntry, Payment, Subscription


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
        max_digits=12,
        decimal_places=4,
        min_value=Decimal("0.01"),
        max_value=Decimal("100000"),
    )


class TopupRequestSerializer(serializers.Serializer):
    amount_rub = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("10"),
        max_value=Decimal("100000"),
    )


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "amount_rub",
            "credits_amount",
            "status",
            "kind",
            "created_at",
        )


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ("status", "price_rub", "current_period_end", "canceled_at")
