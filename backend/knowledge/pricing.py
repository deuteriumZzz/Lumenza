from core.pricing import lookup_price

# Временная фиксированная цена за один эмбеддинг — та же логика
# placeholder-цены, что и во всех остальных *_PRICING в этом проекте
# (media_ops/pricing.py, imagegen/pricing.py): NVIDIA NIM не публикует
# статический прайс за вызов Embeddings API. TODO: сверить с реальным
# счётом NVIDIA.
EMBEDDING_PRICING = {
    "nvidia/nemotron-3-embed-1b": 0.00002,
}


def estimate_embedding_cost_usd(model: str, chunk_count: int) -> float:
    price = lookup_price(EMBEDDING_PRICING, model, "embedding")
    return price * max(1, chunk_count)
