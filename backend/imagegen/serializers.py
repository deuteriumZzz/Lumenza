from rest_framework import serializers

from core.validators import MAX_IMAGE_UPLOAD_BYTES, max_upload_size
from imagegen.models import GeneratedImage

# Публичные категории задач, из которых выбирает клиент — отделены от
# имён провайдера/модели, хранящихся в записи (см.
# services.IMAGE_TASK_ROUTES).
TASK_CHOICES = ["realistic", "illustration", "premium"]


class ImageRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=4000, trim_whitespace=True, allow_blank=False
    )
    task = serializers.ChoiceField(
        choices=TASK_CHOICES, default="illustration"
    )


# Отдельно от ImageRequestSerializer/TASK_CHOICES выше — редактирование
# всегда принимает загруженное изображение вместе с промптом (multipart,
# не JSON), поэтому у него свой эндпоинт/сериализатор, а не общее поле
# "task".
class ImageEditRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=4000, trim_whitespace=True, allow_blank=False
    )
    image = serializers.ImageField(
        validators=[max_upload_size(MAX_IMAGE_UPLOAD_BYTES)]
    )


UPSCALE_TASK_CHOICES = [
    "upscale_2x",
    "upscale_4x",
    "upscale_2x_face",
    "upscale_4x_face",
]


# Апскейл принимает только изображение + пресет — без промпта, в отличие
# от ImageEditRequestSerializer (multipart, свой эндпоинт, та же логика
# разделения, что и у edit).
class ImageUpscaleRequestSerializer(serializers.Serializer):
    image = serializers.ImageField(
        validators=[max_upload_size(MAX_IMAGE_UPLOAD_BYTES)]
    )
    task = serializers.ChoiceField(choices=UPSCALE_TASK_CHOICES)


class GeneratedImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    source_image_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedImage
        fields = (
            "id",
            "prompt",
            "provider",
            "model",
            "status",
            "credits_charged",
            "mocked",
            "image_url",
            "source_image_url",
            "created_at",
            "completed_at",
        )

    def get_image_url(self, obj):
        return self._absolute_url(obj.image)

    def get_source_image_url(self, obj):
        return self._absolute_url(obj.source_image)

    def _absolute_url(self, field_file):
        if not field_file:
            return None
        request = self.context.get("request")
        url = field_file.url
        return request.build_absolute_uri(url) if request else url
