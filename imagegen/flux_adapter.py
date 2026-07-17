from django.conf import settings

from imagegen.base import ImageProviderAdapter, ImageResult
from imagegen.mock import mock_image_bytes
from imagegen.pricing import estimate_image_cost_usd

DEFAULT_MODEL = "flux-schnell"
REPLICATE_MODEL_REF = "black-forest-labs/flux-schnell"


class FluxAdapter(ImageProviderAdapter):
    name = "replicate"

    def generate(self, prompt: str, model: str = DEFAULT_MODEL, **kwargs) -> ImageResult:
        if not settings.REPLICATE_API_TOKEN:
            return ImageResult(
                image_bytes=mock_image_bytes(prompt),
                cost_usd=estimate_image_cost_usd(model),
                model=model,
                mocked=True,
            )

        import replicate

        client = replicate.Client(
            api_token=settings.REPLICATE_API_TOKEN, timeout=self.request_timeout_seconds
        )
        output = client.run(REPLICATE_MODEL_REF, input={"prompt": prompt})
        # replicate.run returns a list of FileOutput-like objects for models
        # with multiple outputs; flux-schnell returns one.
        file_output = output[0] if isinstance(output, list) else output
        image_bytes = file_output.read()

        return ImageResult(
            image_bytes=image_bytes,
            cost_usd=estimate_image_cost_usd(model),
            model=model,
            mocked=False,
        )
