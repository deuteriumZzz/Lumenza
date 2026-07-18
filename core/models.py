from django.conf import settings
from django.db import models


class AnomalyFlag(models.Model):
    class Reason(models.TextChoices):
        REPEATED_MODERATION_BLOCKS = "repeated_moderation_blocks", "Repeated moderation blocks"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="anomaly_flags")
    reason = models.CharField(max_length=32, choices=Reason.choices)
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} — {self.reason}"


class MarginDashboard(models.Model):
    """No real table — exists purely so a ModelAdmin can be registered for
    it. MarginDashboardAdmin.changelist_view is fully overridden to render
    aggregated stats from providers.RequestLog / imagegen.GeneratedImage
    instead of querying this model at all."""

    class Meta:
        managed = False
        verbose_name = "Margin dashboard"
        verbose_name_plural = "Margin dashboard"

    def __str__(self):
        return "Margin dashboard"
