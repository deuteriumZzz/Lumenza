from providers.openai_adapter import OpenAIAdapter

REGISTRY = {
    "openai": OpenAIAdapter(),
}


def get_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown provider: {name}") from exc
