from typing import Literal

MODEL_ACCESS_STANDARD = "standard"
MODEL_ACCESS_PREMIUM = "premium"
ModelAccessClass = Literal["standard", "premium"]

# Fail closed: only models reviewed and explicitly listed here are included
# in the base plan. A newly added or misspelled model is premium until its
# cost and quality have been reviewed.
STANDARD_MODELS = frozenset(
    {
        ("openai", "gpt-4o-mini"),
        ("google", "gemini-1.5-flash"),
        ("search", "gpt-4o-mini"),
        ("nvidia", "nvidia/nvidia-nemotron-nano-9b-v2"),
        ("nvidia", "deepseek-ai/deepseek-v4-flash"),
        ("nvidia", "openai/gpt-oss-120b"),
        ("nvidia", "bytedance/seed-oss-36b-instruct"),
        ("nvidia", "minimaxai/minimax-m3"),
        ("nvidia", "abacusai/dracarys-llama-3.1-70b-instruct"),
        ("nvidia", "meta/llama-3.1-70b-instruct"),
        ("nvidia", "meta/llama-3.2-3b-instruct"),
        ("nvidia", "nvidia/nemotron-mini-4b-instruct"),
        ("nvidia", "stepfun-ai/step-3.7-flash"),
        ("nvidia", "nvidia/nemotron-3-nano-30b-a3b"),
        ("nvidia", "google/gemma-3n-e2b-it"),
        ("nvidia", "stepfun-ai/step-3.5-flash"),
        ("nvidia", "upstage/solar-10.7b-instruct"),
        ("nvidia", "meta/llama-3.1-8b-instruct"),
        ("nvidia", "google/gemma-2-2b-it"),
        ("nvidia", "minimaxai/minimax-m2.7"),
        ("nvidia", "mistralai/mistral-nemotron"),
        ("nvidia", "google/gemma-3n-e4b-it"),
        ("nvidia", "poolside/laguna-xs-2.1"),
        ("nvidia", "qwen/qwen3-next-80b-a3b-instruct"),
        ("nvidia", "sarvamai/sarvam-m"),
        ("nvidia", "nvidia/riva-translate-4b-instruct-v1.1"),
        ("nvidia", "thinkingmachines/inkling"),
        ("nvidia", "openai/gpt-oss-20b"),
    }
)


def get_model_access_class(provider: str, model: str) -> ModelAccessClass:
    if (provider, model) in STANDARD_MODELS:
        return MODEL_ACCESS_STANDARD
    return MODEL_ACCESS_PREMIUM


def can_use_model(user, provider: str, model: str) -> bool:
    return (
        user.tier == "paid"
        or get_model_access_class(provider, model) == MODEL_ACCESS_STANDARD
    )
