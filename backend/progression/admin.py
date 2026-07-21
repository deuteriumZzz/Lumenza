from django.contrib import admin

from progression.models import (
    ModelUnlockable,
    UnlockableResource,
    UserModelUnlock,
    UserUnlock,
)


@admin.register(UnlockableResource)
class UnlockableResourceAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "kind",
        "min_requests",
        "min_distinct_days",
        "sort_order",
    )
    ordering = ("sort_order",)


@admin.register(UserUnlock)
class UserUnlockAdmin(admin.ModelAdmin):
    list_display = ("user", "resource", "unlocked_at")
    list_filter = ("resource",)
    list_select_related = ("user", "resource")
    search_fields = ("user__username",)


@admin.register(ModelUnlockable)
class ModelUnlockableAdmin(admin.ModelAdmin):
    list_display = (
        "task",
        "provider",
        "model",
        "min_requests",
        "min_distinct_days",
        "sort_order",
    )
    list_filter = ("task", "provider")
    ordering = ("task", "sort_order")


@admin.register(UserModelUnlock)
class UserModelUnlockAdmin(admin.ModelAdmin):
    list_display = ("user", "resource", "unlocked_at")
    list_filter = ("resource__task",)
    list_select_related = ("user", "resource")
    search_fields = ("user__username",)
