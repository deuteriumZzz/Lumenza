import time

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.pricing import estimate_cost_usd

DEFAULT_MODEL = "gpt-4o-mini"


class OpenAIAdapter(ProviderAdapter):
    name = "openai"

    def complete(self, prompt: str, model: str = DEFAULT_MODEL, **kwargs) -> ProviderResult:
        start = time.monotonic()

        if not settings.OPENAI_API_KEY:
            return self._mock_result(prompt, model, start)

        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=self.max_completion_tokens,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        usage = response.usage
        text = response.choices[0].message.content

        return ProviderResult(
            text=text,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            cost_usd=estimate_cost_usd(model, usage.prompt_tokens, usage.completion_tokens),
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
