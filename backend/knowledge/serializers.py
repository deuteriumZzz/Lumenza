from rest_framework import serializers

from core.validators import MAX_IMAGE_UPLOAD_BYTES, max_upload_size
from knowledge.models import Source, Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ("id", "name", "created_at", "updated_at")


class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = (
            "id",
            "kind",
            "status",
            "raw_text",
            "credits_charged",
            "error_message",
            "mocked",
            "created_at",
            "completed_at",
        )


class TextSourceRequestSerializer(serializers.Serializer):
    text = serializers.CharField(
        max_length=20000, trim_whitespace=True, allow_blank=False
    )


class ImageSourceRequestSerializer(serializers.Serializer):
    image = serializers.ImageField(
        validators=[max_upload_size(MAX_IMAGE_UPLOAD_BYTES)]
    )


class SearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(
        max_length=500, trim_whitespace=True, allow_blank=False
    )
