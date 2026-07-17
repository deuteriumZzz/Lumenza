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
    # A hung upstream call blocks the request thread; with route fallback
    # chaining up to len(route) provider calls per request, an unbounded
    # per-call timeout could multiply worst-case request latency.
    request_timeout_seconds: float = 15.0

    def complete(self, prompt: str, **kwargs) -> ProviderResult:
        raise NotImplementedError
