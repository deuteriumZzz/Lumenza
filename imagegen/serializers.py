from rest_framework import serializers

from imagegen.models import GeneratedImage

# Public provider keys the client selects from — decoupled from the
# provider/model names stored on the record (see views.IMAGE_ROUTES).
PROVIDER_CHOICES = ["openai", "flux"]


class ImageRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(max_length=4000, trim_whitespace=True, allow_blank=False)
    provider = serializers.ChoiceField(choices=PROVIDER_CHOICES, default="openai")


class GeneratedImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneratedImage
        fields = (
            "id", "prompt", "provider", "model", "status", "credits_charged",
            "mocked", "image_url", "created_at", "completed_at",
        )

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url
