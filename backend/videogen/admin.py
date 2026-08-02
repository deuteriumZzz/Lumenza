from django.contrib import admin

from videogen.models import GeneratedVideo


@admin.register(GeneratedVideo)
class GeneratedVideoAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "provider",
        "model",
        "status",
        "credits_charged",
        "cost_usd",
        "mocked",
        "created_at",
    )
    list_filter = ("provider", "status", "mocked")
    list_select_related = ("user",)
    search_fields = ("user__username", "prompt")
