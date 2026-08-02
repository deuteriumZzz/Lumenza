import io
from collections.abc import Iterable, Iterator
from typing import Any

import httpx
from django.conf import settings

from videogen.base import VideoProviderAdapter, VideoResult
from videogen.mock import mock_video_bytes
from videogen.pricing import estimate_video_cost_usd
from videogen.validation import MAX_GENERATED_VIDEO_BYTES

# Версии закреплены за конкретными моделями Replicate (не выводятся из
# строки `model` записи) — так же, как flux_adapter.REPLICATE_MODEL_REF у
# imagegen. Схема входа обеих моделей подтверждена живым запросом к
# Replicate API с реальным токеном проекта (GET /v1/models/{slug}), а не
# предположением по документации.
TEXT_TO_VIDEO_MODEL = "wan-2.5-t2v-fast"
IMAGE_TO_VIDEO_MODEL = "wan-2.5-i2v-fast"
REPLICATE_MODEL_REFS = {
    TEXT_TO_VIDEO_MODEL: "wan-video/wan-2.5-t2v-fast",
    IMAGE_TO_VIDEO_MODEL: "wan-video/wan-2.5-i2v-fast",
}


def _read_video_output(output: Any) -> bytes:
    if isinstance(output, (list, tuple)):
        if not output:
            raise ValueError("Replicate returned no video output")
        file_output = output[0]
    elif isinstance(output, Iterator):
        try:
            file_output = next(output)
        except StopIteration as exc:
            raise ValueError("Replicate returned no video output") from exc
    else:
        file_output = output

    if not isinstance(file_output, Iterable):
        raise ValueError("Replicate returned invalid video output")

    chunks = []
    total_bytes = 0
    for chunk in file_output:
        if not isinstance(chunk, bytes):
            raise ValueError("Replicate returned invalid video output")
        total_bytes += len(chunk)
        if total_bytes > MAX_GENERATED_VIDEO_BYTES:
            raise ValueError("Replicate video output is too large")
        chunks.append(chunk)
    if not chunks:
        raise ValueError("Replicate returned no video output")
    return b"".join(chunks)


class ReplicateVideoAdapter(VideoProviderAdapter):
    name = "replicate"
    # Видео-генерация и последующая загрузка многомегабайтного файла
    # требуют больше времени, чем дефолт в 30с у базового класса
    # (унаследован от того же значения в ImageProviderAdapter, рассчитан
    # на изображения).
    request_timeout_seconds = 120.0

    def _client(self):
        import replicate

        return replicate.Client(
            api_token=settings.REPLICATE_API_TOKEN,
            timeout=httpx.Timeout(self.request_timeout_seconds),
        )

    def generate(
        self, prompt: str, model: str = TEXT_TO_VIDEO_MODEL, **kwargs
    ) -> VideoResult:
        if not settings.REPLICATE_API_TOKEN:
            return VideoResult(
                video_bytes=mock_video_bytes(prompt),
                cost_usd=estimate_video_cost_usd(model),
                model=model,
                mocked=True,
            )

        output = self._client().run(
            REPLICATE_MODEL_REFS[model], input={"prompt": prompt}
        )
        return VideoResult(
            video_bytes=_read_video_output(output),
            cost_usd=estimate_video_cost_usd(model),
            model=model,
            mocked=False,
        )

    def generate_from_image(
        self,
        prompt: str,
        source_image_bytes: bytes,
        model: str = IMAGE_TO_VIDEO_MODEL,
        **kwargs,
    ) -> VideoResult:
        if not settings.REPLICATE_API_TOKEN:
            return VideoResult(
                video_bytes=mock_video_bytes(prompt),
                cost_usd=estimate_video_cost_usd(model),
                model=model,
                mocked=True,
            )

        # replicate==1.0.7 автоматически загружает любое значение
        # io.IOBase в input через POST /v1/files и подставляет вернувшийся
        # URL (проверено чтением исходников replicate/helpers.py) — сырые
        # bytes для этого не подходят (не io.IOBase), а .name нужен, чтобы
        # content-type не откатился на application/octet-stream.
        source_file = io.BytesIO(source_image_bytes)
        source_file.name = "source.png"

        output = self._client().run(
            REPLICATE_MODEL_REFS[model],
            input={"prompt": prompt, "image": source_file},
        )
        return VideoResult(
            video_bytes=_read_video_output(output),
            cost_usd=estimate_video_cost_usd(model),
            model=model,
            mocked=False,
        )
