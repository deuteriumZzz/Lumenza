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


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        CANCELED = "canceled", "Canceled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payments")
    # YooKassa's own payment id (a UUID they generate) — the join key used
    # to look a payment back up when its webhook notification arrives.
    yookassa_payment_id = models.CharField(max_length=64, unique=True)
    amount_rub = models.DecimalField(max_digits=12, decimal_places=2)
    # Computed once at creation time from the RUB amount and the rate then
    # in effect, so a later rate change can't retroactively change what an
    # already-created payment is worth.
    credits_amount = models.DecimalField(max_digits=12, decimal_places=4)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.amount_rub} RUB ({self.status})"
