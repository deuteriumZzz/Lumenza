from django.contrib import admin

from code_interpreter.models import CodeExecution


@admin.register(CodeExecution)
class CodeExecutionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "language",
        "version",
        "status",
        "credits_charged",
        "mocked",
        "created_at",
    )
    list_filter = ("language", "status", "mocked")
    list_select_related = ("user",)
    search_fields = ("user__username",)
