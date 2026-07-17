from django.contrib import admin

from providers.models import RequestLog


@admin.register(RequestLog)
class RequestLogAdmin(admin.ModelAdmin):
    list_display = (
        "user", "provider", "model", "mode", "status", "credits_charged",
        "cost_usd", "latency_ms", "mocked", "created_at",
    )
    list_filter = ("provider", "status", "mode", "mocked")
    search_fields = ("user__username",)
