import base64
import io

from django.conf import settings

from media_ops.base import DocumentResult
from media_ops.pricing import estimate_photo_analysis_cost_usd

# ПОДТВЕРЖДЕНО РАБОТАЕТ — та же схема OpenAI-совместимых
# chat-completions + блока содержимого image_url, что и в
# nvidia_ocr_adapter.py, но другой промпт/цель: описать содержимое фото
# для идеи подписи/контента, а не транскрибировать буквальный текст на
# нём. Протестировано вживую на синтетическом фото (оранжевый круг на
# сине-зелёном фоне — "солнце над травой") — корректно описано одним
# предложением. Переиспользует DocumentResult (text + cost_usd + model +
# mocked), так как форма идентична; отдельный PhotoAnalysisResult был бы
# различием без разницы.
DEFAULT_MODEL = "nvidia/llama-3.1-nemotron-nano-vl-8b-v1"

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

ANALYSIS_PROMPT = (
    "Describe what's in this photo in 1-2 sentences, written as a "
    "social media caption idea for a content creator — engaging, "
    "not a dry literal description."
)


class NvidiaVisionAdapter:
    name = "nvidia"
    request_timeout_seconds = 30.0

    def analyze(
        self, image_bytes: bytes, model: str = DEFAULT_MODEL, **kwargs
    ) -> DocumentResult:
        if not settings.NVIDIA_API_KEY:
            return self._mock_result(model)

        from openai import OpenAI
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
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
                    "content": [
                        {"type": "text", "text": ANALYSIS_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=200,
        )
        text = response.choices[0].message.content or ""

        return DocumentResult(
            text=text,
            cost_usd=estimate_photo_analysis_cost_usd(model),
            model=model,
            mocked=False,
        )

    def _mock_result(self, model: str) -> DocumentResult:
        return DocumentResult(
            text="[mock] A vibrant scene, perfect for today's post.",
            cost_usd=estimate_photo_analysis_cost_usd(model),
            model=model,
            mocked=True,
        )
