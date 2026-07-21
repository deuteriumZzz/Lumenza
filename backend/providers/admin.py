from django.contrib import admin

from providers.models import RequestLog


@admin.register(RequestLog)
class RequestLogAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "provider",
        "model",
        "task",
        "status",
        "credits_charged",
        "cost_usd",
        "latency_ms",
        "mocked",
        "used_fallback",
        "created_at",
    )
    list_filter = ("provider", "status", "task", "mocked", "used_fallback")
    list_select_related = ("user",)
    search_fields = ("user__username",)
