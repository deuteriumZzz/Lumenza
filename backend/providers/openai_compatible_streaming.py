import time
from typing import Callable

from providers.base import ProviderResult
from providers.pricing import estimate_cost_usd
from providers.validation import validate_token_count

# Shared by OpenAIAdapter and NvidiaAdapter — both point the same `openai`
# SDK client at an OpenAI-compatible chat/completions endpoint (only
# base_url/api_key differ), so the streaming loop itself only needs to
# exist once.


def stream_openai_compatible(
    client,
    prompt: str,
    on_delta: Callable[[str], None],
    model: str,
    max_completion_tokens: int,
    system: str | None,
    temperature: float | None,
    start: float,
    provider_label: str,
) -> ProviderResult:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    create_kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_completion_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if temperature is not None:
        create_kwargs["temperature"] = temperature

    text_parts: list[str] = []
    usage = None
    for chunk in client.chat.completions.create(**create_kwargs):
        if chunk.choices:
            delta = chunk.choices[0].delta.content
            if delta:
                text_parts.append(delta)
                on_delta(delta)
        if chunk.usage is not None:
            usage = chunk.usage

    latency_ms = int((time.monotonic() - start) * 1000)
    text = "".join(text_parts)
    if not text:
        raise ValueError(f"{provider_label} returned no text")
    if usage is None:
        raise ValueError(f"{provider_label} returned no usage metadata")
    prompt_tokens = validate_token_count(usage.prompt_tokens, "prompt_tokens")
    completion_tokens = validate_token_count(
        usage.completion_tokens, "completion_tokens"
    )

    return ProviderResult(
        text=text,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_usd=estimate_cost_usd(model, prompt_tokens, completion_tokens),
        latency_ms=latency_ms,
        model=model,
        mocked=False,
    )
