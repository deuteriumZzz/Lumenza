from dataclasses import dataclass


@dataclass
class ImageResult:
    image_bytes: bytes
    cost_usd: float
    model: str
    mocked: bool = False


class ImageProviderAdapter:
    name: str = "base"
    request_timeout_seconds: float = 30.0

    def generate(self, prompt: str, model: str, **kwargs) -> ImageResult:
        raise NotImplementedError
