from django.conf import settings
from django.db import models


class AnomalyFlag(models.Model):
    class Reason(models.TextChoices):
        REPEATED_MODERATION_BLOCKS = (
            "repeated_moderation_blocks",
            "Repeated moderation blocks",
        )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="anomaly_flags",
    )
    reason = models.CharField(max_length=32, choices=Reason.choices)
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} — {self.reason}"


class MarginDashboard(models.Model):
    """Без настоящей таблицы — существует исключительно для того, чтобы для
    неё можно было зарегистрировать ModelAdmin.
    MarginDashboardAdmin.changelist_view полностью переопределён и рендерит
    агрегированную статистику из providers.RequestLog /
    imagegen.GeneratedImage, вместо того чтобы вообще запрашивать эту
    модель."""

    class Meta:
        managed = False
        verbose_name = "Margin dashboard"
        verbose_name_plural = "Margin dashboard"

    def __str__(self):
        return "Margin dashboard"
