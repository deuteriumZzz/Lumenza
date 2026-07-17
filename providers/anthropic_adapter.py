import time

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.pricing import estimate_cost_usd

DEFAULT_MODEL = "claude-3-5-sonnet-latest"


class AnthropicAdapter(ProviderAdapter):
    name = "anthropic"

    def complete(self, prompt: str, model: str = DEFAULT_MODEL, **kwargs) -> ProviderResult:
        start = time.monotonic()

        if not settings.ANTHROPIC_API_KEY:
            return self._mock_result(prompt, model, start)

        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=self.request_timeout_seconds)
        response = client.messages.create(
            model=model,
            max_tokens=self.max_completion_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        text = "".join(block.text for block in response.content if block.type == "text")

        return ProviderResult(
            text=text,
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            cost_usd=estimate_cost_usd(model, response.usage.input_tokens, response.usage.output_tokens),
            latency_ms=latency_ms,
            model=model,
            mocked=False,
        )

    def _mock_result(self, prompt: str, model: str, start: float) -> ProviderResult:
        text = f"[mock:{self.name}/{model}] {prompt[:200]}"
        prompt_tokens = max(1, len(prompt) // 4)
        completion_tokens = max(1, len(text) // 4)
        latency_ms = int((time.monotonic() - start) * 1000)
        return ProviderResult(
            text=text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=estimate_cost_usd(model, prompt_tokens, completion_tokens),
            latency_ms=latency_ms,
            model=model,
            mocked=True,
        )
