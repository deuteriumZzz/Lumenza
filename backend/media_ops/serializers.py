from rest_framework import serializers

from core.validators import (
    MAX_AUDIO_UPLOAD_BYTES,
    MAX_DOCUMENT_UPLOAD_BYTES,
    MAX_IMAGE_UPLOAD_BYTES,
    max_upload_size,
)
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)


class TranscriptionRequestSerializer(serializers.Serializer):
    audio = serializers.FileField(
        validators=[max_upload_size(MAX_AUDIO_UPLOAD_BYTES)]
    )


class TranscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transcription
        fields = (
            "id",
            "text",
            "status",
            "credits_charged",
            "mocked",
            "created_at",
            "completed_at",
        )


class SpeechRequestSerializer(serializers.Serializer):
    text = serializers.CharField(
        max_length=4000, trim_whitespace=True, allow_blank=False
    )


class SpeechClipSerializer(serializers.ModelSerializer):
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = SpeechClip
        fields = (
            "id",
            "text",
            "status",
            "credits_charged",
            "mocked",
            "audio_url",
            "created_at",
            "completed_at",
        )

    def get_audio_url(self, obj):
        if not obj.audio:
            return None
        request = self.context.get("request")
        url = obj.audio.url
        return request.build_absolute_uri(url) if request else url


class DocumentExtractionRequestSerializer(serializers.Serializer):
    document = serializers.FileField(
        validators=[max_upload_size(MAX_DOCUMENT_UPLOAD_BYTES)]
    )


class DocumentExtractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentExtraction
        fields = (
            "id",
            "text",
            "status",
            "credits_charged",
            "mocked",
            "created_at",
            "completed_at",
        )


class PhotoAnalysisRequestSerializer(serializers.Serializer):
    image = serializers.ImageField(
        validators=[max_upload_size(MAX_IMAGE_UPLOAD_BYTES)]
    )


class PhotoAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhotoAnalysis
        fields = (
            "id",
            "text",
            "status",
            "credits_charged",
            "mocked",
            "created_at",
            "completed_at",
        )
