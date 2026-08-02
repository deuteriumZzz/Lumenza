from dataclasses import dataclass


@dataclass
class VideoResult:
    video_bytes: bytes
    cost_usd: float
    model: str
    mocked: bool = False


class VideoProviderAdapter:
    name: str = "base"
    request_timeout_seconds: float = 30.0

    def generate(self, prompt: str, model: str, **kwargs) -> VideoResult:
        raise NotImplementedError
