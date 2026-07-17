# USD per 1M tokens. Update when provider pricing changes.
PRICING = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}


def _price_for(model: str) -> dict:
    try:
        return PRICING[model]
    except KeyError as exc:
        # No silent zero-cost fallback: an unpriced model must never reach a
        # provider call, since that would let requests through un-billed.
        raise ValueError(f"No pricing configured for model: {model}") from exc


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    price = _price_for(model)
    return (prompt_tokens / 1_000_000) * price["input"] + (completion_tokens / 1_000_000) * price["output"]


def estimate_max_cost_usd(model: str, prompt_chars: int, max_completion_tokens: int) -> float:
    """Conservative worst-case cost for a request, before the real token count is known.

    Assumes 1 token per prompt character (real tokenizers pack more characters
    per token, so this only ever overestimates) and the full completion cap
    for output tokens.
    """
    price = _price_for(model)
    return (prompt_chars / 1_000_000) * price["input"] + (max_completion_tokens / 1_000_000) * price["output"]
