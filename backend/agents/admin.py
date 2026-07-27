from django.contrib import admin

from agents.models import Agent, AgentRun


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ("slug", "name", "version", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("slug", "name")


@admin.register(AgentRun)
class AgentRunAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "agent",
        "user",
        "status",
        "credits_charged",
        "created_at",
    )
    list_filter = ("status", "agent")
    list_select_related = ("agent", "user")
    search_fields = ("user__username",)
