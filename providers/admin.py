from django.contrib import admin

from providers.models import RequestLog


@admin.register(RequestLog)
class RequestLogAdmin(admin.ModelAdmin):
    list_display = (
        "user", "provider", "model", "mode", "status", "credits_charged",
        "cost_usd", "latency_ms", "mocked", "used_fallback", "created_at",
    )
    list_filter = ("provider", "status", "mode", "mocked", "used_fallback")
    search_fields = ("user__username",)
