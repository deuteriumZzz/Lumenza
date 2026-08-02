from core.pricing import lookup_price

# USD за сгенерированное изображение (фиксированная цена, в отличие от
# потокенной у текстовых моделей).
IMAGE_PRICING = {
    "dall-e-3": 0.040,
    "flux-schnell": 0.003,
    # Тарификация NVIDIA NIM основана на кредитах, а не на
    # опубликованной цене за изображение на момент интеграции —
    # временное значение между flux-schnell (дёшево/быстро) и dall-e-3
    # (премиум), так как flux.1-dev — более качественная dev-версия, чем
    # flux-schnell. TODO: сверить с реальным счётом NVIDIA.
    "flux.1-dev": 0.010,
    # Модели редактирования обычно стоят дороже за вызов, чем чистая
    # генерация (они обрабатывают входное изображение в дополнение к
    # промпту) — цена чуть выше flux.1-dev до подтверждения реальным
    # счётом. TODO: сверить.
    "flux.1-kontext-dev": 0.015,
    # real-esrgan (Replicate, community/hardware-time billed) — оценка на
    # лёгкую GPU-модель, тарифицируется так же, как flux-schnell/
    # flux.1-dev/flux.1-kontext-dev выше: фиксированная оценка вместо
    # реального metrics.predict_time на вызов. TODO: сверить с реальным
    # счётом Replicate.
    "real-esrgan": 0.005,
}


def estimate_image_cost_usd(model: str) -> float:
    return lookup_price(IMAGE_PRICING, model, "image")
