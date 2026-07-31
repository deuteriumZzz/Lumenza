import time
from typing import Callable

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.openai_compatible_streaming import stream_openai_compatible
from providers.pricing import estimate_cost_usd
from providers.validation import validate_token_count

DEFAULT_MODEL = "meta/llama-3.2-3b-instruct"

# NVIDIA NIM (build.nvidia.com) предоставляет OpenAI-совместимый API для
# всего своего каталога моделей под одним ключом API — переиспользуем
# SDK openai вместо самописного HTTP-клиента, как и в OpenAIAdapter.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


class NvidiaAdapter(ProviderAdapter):
    name = "nvidia"

    def complete(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> ProviderResult:
        start = time.monotonic()

        if not settings.NVIDIA_API_KEY:
            return self._mock_result(prompt, model, start)

        from openai import OpenAI

        client = OpenAI(
            api_key=settings.NVIDIA_API_KEY,
            base_url=NVIDIA_BASE_URL,
            timeout=self.request_timeout_seconds,
        )
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        create_kwargs = {
            "model": model,
            "messages": messages,
            "max_tokens": self.max_completion_tokens,
        }
        if temperature is not None:
            create_kwargs["temperature"] = temperature
        response = client.chat.completions.create(**create_kwargs)
        latency_ms = int((time.monotonic() - start) * 1000)
        usage = response.usage
        text = response.choices[0].message.content
        if not text:
            raise ValueError("NVIDIA returned no text")
        if usage is None:
            raise ValueError("NVIDIA returned no usage metadata")
        prompt_tokens = validate_token_count(
            usage.prompt_tokens, "prompt_tokens"
        )
        completion_tokens = validate_token_count(
            usage.completion_tokens, "completion_tokens"
        )

        return ProviderResult(
            text=text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=estimate_cost_usd(
                model, prompt_tokens, completion_tokens
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

        if not settings.NVIDIA_API_KEY:
            result = self._mock_result(prompt, model, start)
            on_delta(result.text)
            return result

        from openai import OpenAI

        client = OpenAI(
            api_key=settings.NVIDIA_API_KEY,
            base_url=NVIDIA_BASE_URL,
            timeout=self.request_timeout_seconds,
        )
        return stream_openai_compatible(
            client,
            prompt,
            on_delta,
            model=model,
            max_completion_tokens=self.max_completion_tokens,
            system=system,
            temperature=temperature,
            start=start,
            provider_label="NVIDIA",
        )
