from rest_framework import serializers

from core.validators import MAX_IMAGE_UPLOAD_BYTES, max_upload_size
from videogen.models import GeneratedVideo


class VideoRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=4000, trim_whitespace=True, allow_blank=False
    )


class VideoAnimateRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=4000, trim_whitespace=True, allow_blank=False
    )
    image = serializers.ImageField(
        validators=[max_upload_size(MAX_IMAGE_UPLOAD_BYTES)]
    )


class GeneratedVideoSerializer(serializers.ModelSerializer):
    video_url = serializers.SerializerMethodField()
    source_image_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedVideo
        fields = (
            "id",
            "prompt",
            "provider",
            "model",
            "status",
            "credits_charged",
            "mocked",
            "video_url",
            "source_image_url",
            "created_at",
            "completed_at",
        )

    def get_video_url(self, obj):
        return self._absolute_url(obj.video)

    def get_source_image_url(self, obj):
        return self._absolute_url(obj.source_image)

    def _absolute_url(self, field_file):
        if not field_file:
            return None
        request = self.context.get("request")
        url = field_file.url
        return request.build_absolute_uri(url) if request else url
