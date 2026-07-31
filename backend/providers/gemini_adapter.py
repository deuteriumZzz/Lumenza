import time
from typing import Callable

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult
from providers.pricing import estimate_cost_usd
from providers.validation import validate_token_count

DEFAULT_MODEL = "gemini-1.5-flash"


class GeminiAdapter(ProviderAdapter):
    name = "google"

    def complete(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> ProviderResult:
        start = time.monotonic()

        if not settings.GOOGLE_API_KEY:
            return self._mock_result(prompt, model, start)

        # Перешли с google-generativeai (устарел, "all support has
        # ended" в апстриме) на google-genai — вынужденно, из-за
        # жёсткого конфликта версий protobuf с nvidia-riva-client (см.
        # requirements.txt). В этом dev-окружении не настроен реальный
        # GOOGLE_API_KEY, так что этот путь вызова не проверен на живом
        # API — та же оговорка, что и у ветки с реальным ключом в любом
        # другом адаптере, не специфична именно для этой миграции.
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        config_kwargs = {
            "max_output_tokens": self.max_completion_tokens,
            "http_options": types.HttpOptions(
                timeout=int(self.request_timeout_seconds * 1000)
            ),
        }
        if system:
            config_kwargs["system_instruction"] = system
        if temperature is not None:
            config_kwargs["temperature"] = temperature
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        usage = response.usage_metadata
        text = response.text
        if not text:
            raise ValueError("Gemini returned no text")
        if usage is None:
            raise ValueError("Gemini returned no usage metadata")
        prompt_tokens = usage.prompt_token_count
        completion_tokens = usage.candidates_token_count
        if prompt_tokens is None or completion_tokens is None:
            raise ValueError("Gemini returned incomplete usage metadata")
        prompt_tokens = validate_token_count(prompt_tokens, "prompt_tokens")
        completion_tokens = validate_token_count(
            completion_tokens, "completion_tokens"
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

        if not settings.GOOGLE_API_KEY:
            result = self._mock_result(prompt, model, start)
            on_delta(result.text)
            return result

        # Тот же предупреждающий комментарий, что и у complete() выше:
        # GOOGLE_API_KEY не настроен в этом dev-окружении, поэтому
        # предположение о том, что чанки generate_content_stream несут
        # инкрементальный (не кумулятивный) .text, не проверено на живом
        # API — только на мок-пути.
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        config_kwargs = {
            "max_output_tokens": self.max_completion_tokens,
            "http_options": types.HttpOptions(
                timeout=int(self.request_timeout_seconds * 1000)
            ),
        }
        if system:
            config_kwargs["system_instruction"] = system
        if temperature is not None:
            config_kwargs["temperature"] = temperature

        stream = client.models.generate_content_stream(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        text_parts: list[str] = []
        usage = None
        for chunk in stream:
            if chunk.text:
                text_parts.append(chunk.text)
                on_delta(chunk.text)
            if chunk.usage_metadata is not None:
                usage = chunk.usage_metadata

        latency_ms = int((time.monotonic() - start) * 1000)
        text = "".join(text_parts)
        if not text:
            raise ValueError("Gemini returned no text")
        if usage is None:
            raise ValueError("Gemini returned no usage metadata")
        prompt_tokens = usage.prompt_token_count
        completion_tokens = usage.candidates_token_count
        if prompt_tokens is None or completion_tokens is None:
            raise ValueError("Gemini returned incomplete usage metadata")
        prompt_tokens = validate_token_count(prompt_tokens, "prompt_tokens")
        completion_tokens = validate_token_count(
            completion_tokens, "completion_tokens"
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
