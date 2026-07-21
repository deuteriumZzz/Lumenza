from collections.abc import Iterable, Iterator
from typing import Any

import httpx
from django.conf import settings

from imagegen.base import ImageProviderAdapter, ImageResult
from imagegen.mock import mock_image_bytes
from imagegen.pricing import estimate_image_cost_usd
from imagegen.validation import (
    MAX_GENERATED_IMAGE_BYTES,
    decode_base64_image,
    normalize_generated_image,
)

DEFAULT_MODEL = "flux-schnell"
REPLICATE_MODEL_REF = "black-forest-labs/flux-schnell"


def _read_image_output(output: Any) -> bytes:
    if isinstance(output, (list, tuple)):
        if not output:
            raise ValueError("Replicate returned no image output")
        file_output = output[0]
    elif isinstance(output, Iterator):
        try:
            file_output = next(output)
        except StopIteration as exc:
            raise ValueError("Replicate returned no image output") from exc
    else:
        file_output = output

    output_url = getattr(file_output, "url", None)
    if isinstance(output_url, str) and output_url.startswith("data:"):
        _, _, encoded_image = output_url.partition(",")
        return decode_base64_image(encoded_image)

    if not isinstance(file_output, Iterable):
        raise ValueError("Replicate returned invalid image output")

    chunks = []
    total_bytes = 0
    for chunk in file_output:
        if not isinstance(chunk, bytes):
            raise ValueError("Replicate returned invalid image output")
        total_bytes += len(chunk)
        if total_bytes > MAX_GENERATED_IMAGE_BYTES:
            raise ValueError("Replicate image output is too large")
        chunks.append(chunk)
    if not chunks:
        raise ValueError("Replicate returned no image output")
    return normalize_generated_image(b"".join(chunks))


class FluxAdapter(ImageProviderAdapter):
    name = "replicate"

    def generate(
        self, prompt: str, model: str = DEFAULT_MODEL, **kwargs
    ) -> ImageResult:
        if not settings.REPLICATE_API_TOKEN:
            return ImageResult(
                image_bytes=mock_image_bytes(prompt),
                cost_usd=estimate_image_cost_usd(model),
                model=model,
                mocked=True,
            )

        import replicate

        client = replicate.Client(
            api_token=settings.REPLICATE_API_TOKEN,
            timeout=httpx.Timeout(self.request_timeout_seconds),
        )
        output = client.run(REPLICATE_MODEL_REF, input={"prompt": prompt})
        image_bytes = _read_image_output(output)

        return ImageResult(
            image_bytes=image_bytes,
            cost_usd=estimate_image_cost_usd(model),
            model=model,
            mocked=False,
        )
