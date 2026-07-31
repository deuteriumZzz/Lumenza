import time
from typing import Callable

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.pricing import estimate_cost_usd

DEFAULT_MODEL = "claude-3-5-sonnet-latest"


class AnthropicAdapter(ProviderAdapter):
    name = "anthropic"

    def complete(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> ProviderResult:
        start = time.monotonic()

        if not settings.ANTHROPIC_API_KEY:
            return self._mock_result(prompt, model, start)

        from anthropic import Anthropic

        client = Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=self.request_timeout_seconds,
        )
        create_kwargs = {
            "model": model,
            "max_tokens": self.max_completion_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            create_kwargs["system"] = system
        if temperature is not None:
            create_kwargs["temperature"] = temperature
        response = client.messages.create(**create_kwargs)
        latency_ms = int((time.monotonic() - start) * 1000)
        text = "".join(
            block.text for block in response.content if block.type == "text"
        )

        return ProviderResult(
            text=text,
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
            cost_usd=estimate_cost_usd(
                model,
                response.usage.input_tokens,
                response.usage.output_tokens,
            ),
            latency_ms=latency_ms,
            model=model,
            mocked=False,
        )

    def _mock_result(
        self, prompt: str, model: str, start: float
    ) -> ProviderResult:
        text = prompt[:200]
        prompt_tokens = max(1, len(prompt) // 4)
        completion_tokens = max(1, len(text) // 4)
        latency_ms = int((time.monotonic() - start) * 1000)
        return ProviderResult(
            text=text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=estimate_cost_usd(
                model, prompt_tokens, completion_tokens
            ),
            latency_ms=latency_ms,
            model=model,
            mocked=True,
        )

    def stream_complete(
        self,
        prompt: str,
        on_delta: Callable[[str], None],
        model: str = DEFAULT_MODEL,
        system: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> ProviderResult:
        start = time.monotonic()

        if not settings.ANTHROPIC_API_KEY:
            result = self._mock_result(prompt, model, start)
            on_delta(result.text)
            return result

        from anthropic import Anthropic

        client = Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=self.request_timeout_seconds,
        )
        create_kwargs = {
            "model": model,
            "max_tokens": self.max_completion_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            create_kwargs["system"] = system
        if temperature is not None:
            create_kwargs["temperature"] = temperature

        with client.messages.stream(**create_kwargs) as stream:
            for delta in stream.text_stream:
                on_delta(delta)
            final = stream.get_final_message()

        latency_ms = int((time.monotonic() - start) * 1000)
        text = "".join(
            block.text for block in final.content if block.type == "text"
        )

        return ProviderResult(
            text=text,
            prompt_tokens=final.usage.input_tokens,
            completion_tokens=final.usage.output_tokens,
            cost_usd=estimate_cost_usd(
                model,
                final.usage.input_tokens,
                final.usage.output_tokens,
            ),
            latency_ms=latency_ms,
            model=model,
            mocked=False,
        )
