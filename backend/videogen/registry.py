from videogen.replicate_video_adapter import ReplicateVideoAdapter

REGISTRY = {
    "replicate": ReplicateVideoAdapter(),
}


def get_video_adapter(name: str):
    try:
        return REGISTRY[name]
    except KeyError as exc:
        raise ValueError(f"Unknown video provider: {name}") from exc
