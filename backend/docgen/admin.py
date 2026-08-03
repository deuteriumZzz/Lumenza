from django.contrib import admin

from docgen.models import GeneratedPresentation, GeneratedSpreadsheet


@admin.register(GeneratedPresentation)
class GeneratedPresentationAdmin(admin.ModelAdmin):
    list_display = (
        "user", "status", "credits_charged", "cost_usd", "created_at"
    )
    list_filter = ("status",)
    list_select_related = ("user",)
    search_fields = ("user__username", "source_text")


@admin.register(GeneratedSpreadsheet)
class GeneratedSpreadsheetAdmin(admin.ModelAdmin):
    list_display = (
        "user", "status", "credits_charged", "cost_usd", "created_at"
    )
    list_filter = ("status",)
    list_select_related = ("user",)
    search_fields = ("user__username", "source_text")
