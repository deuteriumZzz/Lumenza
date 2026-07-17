from dataclasses import dataclass


@dataclass
class ProviderResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    model: str
    mocked: bool = False


class ProviderAdapter:
    name: str = "base"
    max_completion_tokens: int = 1024

    def complete(self, prompt: str, **kwargs) -> ProviderResult:
        raise NotImplementedError
