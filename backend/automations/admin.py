from django.contrib import admin

from automations.models import PendingAction, ScheduledAgentRun, TelegramChannel


@admin.register(TelegramChannel)
class TelegramChannelAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "chat_id", "connected_at")
    list_select_related = ("user",)
    search_fields = ("user__username", "title")


@admin.register(ScheduledAgentRun)
class ScheduledAgentRunAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "agent",
        "hour",
        "minute",
        "is_active",
        "next_run_at",
        "last_run_at",
    )
    list_filter = ("is_active", "agent")
    list_select_related = ("user", "agent")
    search_fields = ("user__username",)


@admin.register(PendingAction)
class PendingActionAdmin(admin.ModelAdmin):
    list_display = ("user", "channel", "status", "created_at", "sent_at")
    list_filter = ("status",)
    list_select_related = ("user", "channel")
    search_fields = ("user__username",)
