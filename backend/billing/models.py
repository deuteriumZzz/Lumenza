from decimal import Decimal

from django.conf import settings
from django.db import models


class CreditAccount(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="credit_account",
    )
    balance = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("0")
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} — {self.balance} credits"


class LedgerEntry(models.Model):
    class Reason(models.TextChoices):
        SIGNUP_BONUS = "signup_bonus", "Signup bonus"
        TOPUP = "topup", "Top-up"
        CHAT_REQUEST = "chat_request", "Chat request"
        IMAGE_REQUEST = "image_request", "Image request"
        TRANSCRIPTION_REQUEST = (
            "transcription_request",
            "Voice transcription request",
        )
        SPEECH_REQUEST = "speech_request", "Text-to-speech request"
        DOCUMENT_REQUEST = "document_request", "Document extraction request"
        PHOTO_ANALYSIS_REQUEST = (
            "photo_analysis_request",
            "Photo analysis request",
        )
        LIVE_VOICE_SESSION = "live_voice_session", "Live voice session"
        KNOWLEDGE_INGEST_REQUEST = (
            "knowledge_ingest_request",
            "Knowledge ingest request",
        )
        CODE_EXECUTION_REQUEST = (
            "code_execution_request",
            "Code execution request",
        )
        VIDEO_REQUEST = "video_request", "Video generation request"
        UPSCALE_REQUEST = "upscale_request", "Image upscale request"
        PPTX_GENERATION_REQUEST = (
            "pptx_generation_request",
            "PowerPoint generation request",
        )
        EXCEL_GENERATION_REQUEST = (
            "excel_generation_request",
            "Excel generation request",
        )
        REFUND = "refund", "Refund"
        REFERRAL_BONUS = "referral_bonus", "Referral bonus"

    account = models.ForeignKey(
        CreditAccount, on_delete=models.CASCADE, related_name="entries"
    )
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

    class Kind(models.TextChoices):
        TOPUP = "topup", "Top-up"
        SUBSCRIPTION = "subscription", "Subscription"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    # Собственный id платежа от YooKassa (UUID, который генерируют они)
    # — ключ связи, по которому платёж находится снова, когда приходит
    # его уведомление вебхука.
    yookassa_payment_id = models.CharField(max_length=64, unique=True)
    amount_rub = models.DecimalField(max_digits=12, decimal_places=2)
    # Вычисляется один раз в момент создания из суммы в рублях и курса,
    # действовавшего тогда, так что более позднее изменение курса не
    # может задним числом изменить стоимость уже созданного платежа.
    # Всегда 0 для kind=SUBSCRIPTION — такие платежи дают доступ к
    # тарифу PAID, а не кредиты.
    credits_amount = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("0")
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    kind = models.CharField(
        max_length=16, choices=Kind.choices, default=Kind.TOPUP
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.amount_rub} RUB ({self.status})"


class Subscription(models.Model):
    """Периодический доступ к Pro через механизм сохранённого способа
    оплаты YooKassa — первый платёж (Payment.kind=SUBSCRIPTION,
    создан с save_payment_method=True) даёт переиспользуемый
    yookassa_payment_method_id, который billing.tasks.renew_subscriptions
    автоматически списывает каждый период, без участия пользователя."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        NON_RENEWING = "non_renewing", "Non-renewing"
        PAST_DUE = "past_due", "Past due"
        CANCELED = "canceled", "Canceled"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    yookassa_payment_method_id = models.CharField(max_length=64)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    price_rub = models.DecimalField(max_digits=12, decimal_places=2)
    current_period_end = models.DateTimeField()
    canceled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        until = self.current_period_end.strftime("%Y-%m-%d")
        return f"{self.user} subscription ({self.status}, until {until})"
