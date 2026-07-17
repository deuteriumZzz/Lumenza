import time

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.pricing import estimate_cost_usd

DEFAULT_MODEL = "gemini-1.5-flash"


class GeminiAdapter(ProviderAdapter):
    name = "google"

    def complete(self, prompt: str, model: str = DEFAULT_MODEL, **kwargs) -> ProviderResult:
        start = time.monotonic()

        if not settings.GOOGLE_API_KEY:
            return self._mock_result(prompt, model, start)

        import google.generativeai as genai

        genai.configure(api_key=settings.GOOGLE_API_KEY)
        client = genai.GenerativeModel(model)
        response = client.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(max_output_tokens=self.max_completion_tokens),
            request_options={"timeout": self.request_timeout_seconds},
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        usage = response.usage_metadata

        return ProviderResult(
            text=response.text,
            prompt_tokens=usage.prompt_token_count,
            completion_tokens=usage.candidates_token_count,
            cost_usd=estimate_cost_usd(model, usage.prompt_token_count, usage.candidates_token_count),
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
