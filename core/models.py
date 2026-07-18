from django.db import models


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
