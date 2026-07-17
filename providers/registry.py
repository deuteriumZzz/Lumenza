from providers.anthropic_adapter import AnthropicAdapter
from providers.gemini_adapter import GeminiAdapter
from providers.openai_adapter import OpenAIAdapter

REGISTRY = {
    "openai": OpenAIAdapter(),
    "anthropic": AnthropicAdapter(),
    "google": GeminiAdapter(),
}


def get_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown provider: {name}") from exc
