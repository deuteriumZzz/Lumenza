from decimal import Decimal

from django.conf import settings
from django.db import models


class CreditAccount(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="credit_account"
    )
    balance = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0"))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} — {self.balance} credits"


class LedgerEntry(models.Model):
    class Reason(models.TextChoices):
        SIGNUP_BONUS = "signup_bonus", "Signup bonus"
        TOPUP = "topup", "Top-up"
        CHAT_REQUEST = "chat_request", "Chat request"
        IMAGE_REQUEST = "image_request", "Image request"
        REFUND = "refund", "Refund"

    account = models.ForeignKey(CreditAccount, on_delete=models.CASCADE, related_name="entries")
    amount = models.DecimalField(max_digits=12, decimal_places=4)
    reason = models.CharField(max_length=32, choices=Reason.choices)
    balance_after = models.DecimalField(max_digits=12, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.account.user} {self.amount} ({self.reason})"
