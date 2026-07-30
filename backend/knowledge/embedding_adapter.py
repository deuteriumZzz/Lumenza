import hashlib
from dataclasses import dataclass

from django.conf import settings

from knowledge.pricing import estimate_embedding_cost_usd

DEFAULT_MODEL = "nvidia/nemotron-3-embed-1b"
# NVIDIA NIM предоставляет OpenAI-совместимый Embeddings API под тем же
# base_url, что и chat completions в providers/nvidia_adapter.py.
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MOCK_DIMENSIONS = 16


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    cost_usd: float
    mocked: bool


class NvidiaEmbeddingAdapter:
    name = "nvidia"

    def embed(
        self, texts: list[str], model: str = DEFAULT_MODEL
    ) -> EmbeddingResult:
        cost_usd = estimate_embedding_cost_usd(model, len(texts))

        if not settings.NVIDIA_API_KEY:
            return EmbeddingResult(
                vectors=[self._mock_vector(text) for text in texts],
                cost_usd=cost_usd,
                mocked=True,
            )

        from openai import OpenAI

        client = OpenAI(
            api_key=settings.NVIDIA_API_KEY, base_url=NVIDIA_BASE_URL
        )
        response = client.embeddings.create(model=model, input=texts)
        vectors = [item.embedding for item in response.data]
        return EmbeddingResult(
            vectors=vectors, cost_usd=cost_usd, mocked=False
        )

    def _mock_vector(self, text: str) -> list[float]:
        # Детерминированный псевдо-вектор от хэша текста — тот же текст
        # всегда даёт тот же вектор без реального ключа NVIDIA, тот же
        # принцип, что и у _mock_result каждого другого адаптера
        # (providers/openai_adapter.py и т.д.), но детерминированный по
        # содержимому, а не по длине — иначе похожие по длине, но разные
        # по смыслу чанки получали бы одинаковый вектор.
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        return [(byte / 255.0) * 2 - 1 for byte in digest[:MOCK_DIMENSIONS]]
