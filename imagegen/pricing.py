# USD per generated image (flat, unlike token-priced text models).
IMAGE_PRICING = {
    "dall-e-3": 0.040,
    "flux-schnell": 0.003,
}


def estimate_image_cost_usd(model: str) -> float:
    try:
        return IMAGE_PRICING[model]
    except KeyError as exc:
        raise ValueError(f"No pricing configured for image model: {model}") from exc
