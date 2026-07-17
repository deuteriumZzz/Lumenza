from imagegen.flux_adapter import FluxAdapter
from imagegen.openai_image_adapter import OpenAIImageAdapter

REGISTRY = {
    "openai": OpenAIImageAdapter(),
    "replicate": FluxAdapter(),
}


def get_image_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown image provider: {name}") from exc
