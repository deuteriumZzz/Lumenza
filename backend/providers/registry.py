from providers.anthropic_adapter import AnthropicAdapter
from providers.gemini_adapter import GeminiAdapter
from providers.nvidia_adapter import NvidiaAdapter
from providers.openai_adapter import OpenAIAdapter
from providers.search_adapter import SearchAdapter

REGISTRY = {
    "openai": OpenAIAdapter(),
    "anthropic": AnthropicAdapter(),
    "google": GeminiAdapter(),
    "nvidia": NvidiaAdapter(),
    "search": SearchAdapter(),
}


def get_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown provider: {name}") from exc
