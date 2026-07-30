from django.contrib import admin

from knowledge.models import Chunk, Source, Workspace


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "updated_at")
    list_select_related = ("user",)
    search_fields = ("name", "user__username")


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "workspace",
        "kind",
        "status",
        "credits_charged",
        "created_at",
    )
    list_filter = ("status", "kind")
    list_select_related = ("workspace",)


@admin.register(Chunk)
class ChunkAdmin(admin.ModelAdmin):
    list_display = ("id", "source", "index")
    list_select_related = ("source",)
