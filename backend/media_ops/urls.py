from django.urls import path

from media_ops.views import (
    DocumentExtractionDetailView,
    PhotoAnalysisDetailView,
    SpeechClipDetailView,
    TranscriptionDetailView,
    create_document_extraction,
    create_photo_analysis,
    create_speech,
    create_transcription,
)

urlpatterns = [
    path("transcriptions/", create_transcription, name="create-transcription"),
    path(
        "transcriptions/<int:pk>/",
        TranscriptionDetailView.as_view(),
        name="transcription-detail",
    ),
    path("speech/", create_speech, name="create-speech"),
    path(
        "speech/<int:pk>/",
        SpeechClipDetailView.as_view(),
        name="speech-detail",
    ),
    path(
        "documents/",
        create_document_extraction,
        name="create-document-extraction",
    ),
    path(
        "documents/<int:pk>/",
        DocumentExtractionDetailView.as_view(),
        name="document-extraction-detail",
    ),
    path(
        "photos/analyze/", create_photo_analysis, name="create-photo-analysis"
    ),
    path(
        "photos/analyze/<int:pk>/",
        PhotoAnalysisDetailView.as_view(),
        name="photo-analysis-detail",
    ),
]
