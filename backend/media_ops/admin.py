from django.contrib import admin

from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)


class MediaOpsAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "provider",
        "model",
        "status",
        "credits_charged",
        "mocked",
        "created_at",
    )
    list_filter = ("provider", "status", "mocked")
    list_select_related = ("user",)
    search_fields = ("user__username",)


@admin.register(Transcription)
class TranscriptionAdmin(MediaOpsAdmin):
    pass


@admin.register(SpeechClip)
class SpeechClipAdmin(MediaOpsAdmin):
    pass


@admin.register(DocumentExtraction)
class DocumentExtractionAdmin(MediaOpsAdmin):
    pass


@admin.register(PhotoAnalysis)
class PhotoAnalysisAdmin(MediaOpsAdmin):
    pass
