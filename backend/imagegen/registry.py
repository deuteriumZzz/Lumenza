from imagegen.flux_adapter import FluxAdapter
from imagegen.nvidia_image_adapter import NvidiaImageAdapter
from imagegen.openai_image_adapter import OpenAIImageAdapter

REGISTRY = {
    "openai": OpenAIImageAdapter(),
    "replicate": FluxAdapter(),
    "nvidia": NvidiaImageAdapter(),
}


def get_image_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown image provider: {name}") from exc
