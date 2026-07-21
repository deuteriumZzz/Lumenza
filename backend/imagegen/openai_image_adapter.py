import base64

from django.conf import settings

from imagegen.base import ImageProviderAdapter, ImageResult
from imagegen.mock import mock_image_bytes
from imagegen.pricing import estimate_image_cost_usd

DEFAULT_MODEL = "dall-e-3"


class OpenAIImageAdapter(ImageProviderAdapter):
    name = "openai"

    def generate(
        self, prompt: str, model: str = DEFAULT_MODEL, **kwargs
    ) -> ImageResult:
        if not settings.OPENAI_API_KEY:
            return ImageResult(
                image_bytes=mock_image_bytes(prompt),
                cost_usd=estimate_image_cost_usd(model),
                model=model,
                mocked=True,
            )

        from openai import OpenAI

        client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=self.request_timeout_seconds,
        )
        response = client.images.generate(
            model=model,
            prompt=prompt,
            size="1024x1024",
            n=1,
            response_format="b64_json",
        )
        image_bytes = base64.b64decode(response.data[0].b64_json)

        return ImageResult(
            image_bytes=image_bytes,
            cost_usd=estimate_image_cost_usd(model),
            model=model,
            mocked=False,
        )
