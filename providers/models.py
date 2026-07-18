from django.conf import settings
from django.db import models


class RequestLog(models.Model):
    class Status(models.TextChoices):
        OK = "ok", "OK"
        ERROR = "error", "Error"
        INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
        BLOCKED = "blocked", "Blocked by moderation"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="request_logs"
    )
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    mode = models.CharField(max_length=16, default="fast")
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.OK)
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    used_fallback = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.provider}/{self.model} {self.status}"
