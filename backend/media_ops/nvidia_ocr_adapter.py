import base64
import io
import json

from django.conf import settings

from media_ops.base import DocumentResult
from media_ops.pricing import estimate_document_cost_usd

# ПОДТВЕРЖДЕНО РАБОТАЕТ — nvidia/nemoretriever-parse на самом деле НЕ
# оказалась нерабочей; более ранняя находка "так и не заработало" была
# ошибкой тестирования, а не реальным пробелом в доступе. Это
# специализированная модель структурной разметки/OCR, вызывается через
# тот же эндпоинт chat-completions, что и всё остальное, но с двумя
# неочевидными требованиями, найденными опытным путём: (1) содержимое
# сообщения должно быть ТОЛЬКО блоком image_url — если рядом добавить
# текстовую инструкцию, запрос отклоняется с "Content cannot be a plain
# string. The model does not support text input."; (2) результат
# приходит как tool_call (имя функции "markdown_bbox"), а не обычной
# строкой message.content — его JSON-аргументы это список страниц,
# каждая — список блоков {bbox, text, type}. Точнее, чем прежний
# обходной путь через meta/llama-3.2-11b-vision-instruct (настоящие
# bounding box, а не просто перефразированная транскрипция), хотя сами
# данные bbox пока не выводятся наружу — только склеенный текст, чтобы
# форма DocumentResult оставалась неизменной для всех существующих
# вызывающих. Обрабатывает так только форматы изображений
# (PNG/JPEG/WebP) — загрузка PDF этим путём пока не обрабатывается
# (фронтенд принимает .pdf, но этому адаптеру сначала понадобилась бы
# растеризация PDF->изображение, пока не реализовано).
DEFAULT_MODEL = "nvidia/nemoretriever-parse"

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


class NvidiaOcrAdapter:
    name = "nvidia"
    request_timeout_seconds = 30.0

    def extract(
        self, document_bytes: bytes, model: str = DEFAULT_MODEL, **kwargs
    ) -> DocumentResult:
        if not settings.NVIDIA_API_KEY:
            return self._mock_result(model)

        from openai import OpenAI
        from PIL import Image

        # Приводим к PNG независимо от формата загрузки, чтобы mime-тип
        # data-URL всегда был корректным — иначе вызову модели неважно,
        # в каком формате был исходный загруженный файл.
        image = Image.open(io.BytesIO(document_bytes))
        normalized = io.BytesIO()
        image.convert("RGB").save(normalized, format="PNG")
        image_b64 = base64.b64encode(normalized.getvalue()).decode()

        client = OpenAI(
            api_key=settings.NVIDIA_API_KEY,
            base_url=NVIDIA_BASE_URL,
            timeout=self.request_timeout_seconds,
        )
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    # Только изображение — почему рядом с ним текстовый
                    # блок отклоняется этой моделью, см. докстринг
                    # модуля выше.
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=1024,
        )
        text = self._extract_text(response)

        return DocumentResult(
            text=text,
            cost_usd=estimate_document_cost_usd(model),
            model=model,
            mocked=False,
        )

    def _extract_text(self, response) -> str:
        message = response.choices[0].message
        if not message.tool_calls:
            # Защитный запасной путь, не подтверждённый живыми тестами —
            # каждый живой тест до сих пор возвращал tool_call, никогда
            # не обычный content.
            return message.content or ""

        pages = json.loads(message.tool_calls[0].function.arguments)
        segments = []
        for page in pages:
            for block in page:
                block_text = (block.get("text") or "").strip()
                if block_text:
                    segments.append(block_text)
        return "\n".join(segments)

    def _mock_result(self, model: str) -> DocumentResult:
        return DocumentResult(
            text="[mock extracted text]",
            cost_usd=estimate_document_cost_usd(model),
            model=model,
            mocked=True,
        )
