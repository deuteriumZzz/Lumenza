from core.pricing import lookup_price

# USD за сгенерированный клип (фиксированная оценка на 5-секундный ролик
# по умолчанию — как и у изображений, продиктовано ценой самой быстрой/
# дешёвой модели каждого маршрута). Replicate тарифицирует эти community-
# модели по факту затраченного времени GPU (metrics.predict_time × ставка
# железа), а не по фиксированной цене — как и flux-schnell/flux.1-dev в
# imagegen/pricing.py, здесь используется консервативная фиксированная
# оценка вместо разбора реального счёта на каждый вызов, ради
# единообразия с уже устоявшимся паттерном. TODO: сверить с реальным
# счётом Replicate после первых живых генераций.
VIDEO_PRICING = {
    "wan-2.5-t2v-fast": 0.25,
    "wan-2.5-i2v-fast": 0.25,
}


def estimate_video_cost_usd(model: str) -> float:
    return lookup_price(VIDEO_PRICING, model, "video")
