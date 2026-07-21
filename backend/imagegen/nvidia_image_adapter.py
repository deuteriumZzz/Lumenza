import base64

from django.conf import settings

from imagegen.base import ImageProviderAdapter, ImageResult
from imagegen.mock import mock_image_bytes
from imagegen.pricing import estimate_image_cost_usd

DEFAULT_MODEL = "flux.1-dev"
EDIT_MODEL = "flux.1-kontext-dev"

# NIM-модели генерации изображений NVIDIA (в отличие от каталога LLM)
# вызываются через отдельный REST API "genai cloud functions", а не
# через OpenAI-совместимый эндпоинт, который использует
# providers/nvidia_adapter.py — подтверждено живым тестовым вызовом.
# Синхронные ответы приходят в виде {"artifacts": [{"base64": ...}]}.
NVIDIA_GENAI_URL = (
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev"
)
NVIDIA_GENAI_EDIT_URL = (
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev"
)

# flux.1-kontext-dev (редактирование image-to-image) не принимает поле
# "image" со встроенным base64 так, как это делает вызов
# OCR/vision-модели — в ответ приходит 422 "Expected: example_id, got:
# base64". Восстановлено методом реверс-инжиниринга через живые тесты
# (нигде в документации не найдено): входное изображение сначала нужно
# загрузить через отдельный API NVCF assets от NVIDIA (два шага: POST
# для получения assetId + presigned S3 uploadUrl, затем PUT байтов
# туда), а затем сослаться на него в вызове генерации как на data-URI,
# где второй сегмент — буквально ключевое слово "example_id" (не
# "base64"), за которым следует assetId, плюс заголовок
# NVCF-INPUT-ASSET-REFERENCES с именем этого asset. ОГОВОРКА: этот
# формат запроса подтверждён как корректный (собственный валидатор
# NVIDIA его принимает, минуя точку, где неверная форма даёт 422), но
# реальный сквозной вызов генерации всё равно возвращает 500 "Internal
# Server Error" (nvcf-status: errored) независимо от промпта или
# входного изображения — проверено на нескольких изображениях/промптах,
# стабильно воспроизводится, не разовый сбой. Похоже на ту же ситуацию
# "числится в каталоге, но не полностью выделено для этого аккаунта",
# что задокументирована в других местах, а не на баг в этом адаптере.
# Оставлено подключённым (выбрасывает исключение, как и любая другая
# ошибка провайдера, так что кредиты возвращаются через обычный путь
# обработки ошибок), чтобы заработать само, как только бэкенд NVIDIA для
# этой модели стабилизируется.
NVIDIA_ASSETS_URL = "https://api.nvcf.nvidia.com/v2/nvcf/assets"


class NvidiaImageAdapter(ImageProviderAdapter):
    name = "nvidia"

    def generate(
        self, prompt: str, model: str = DEFAULT_MODEL, **kwargs
    ) -> ImageResult:
        if not settings.NVIDIA_API_KEY:
            return ImageResult(
                image_bytes=mock_image_bytes(prompt),
                cost_usd=estimate_image_cost_usd(model),
                model=model,
                mocked=True,
            )

        import requests

        response = requests.post(
            NVIDIA_GENAI_URL,
            headers={
                "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json={
                "prompt": prompt,
                "mode": "base",
                "cfg_scale": 3.5,
                "width": 1024,
                "height": 1024,
                "steps": 30,
            },
            timeout=self.request_timeout_seconds,
        )
        response.raise_for_status()
        image_bytes = base64.b64decode(
            response.json()["artifacts"][0]["base64"]
        )

        return ImageResult(
            image_bytes=image_bytes,
            cost_usd=estimate_image_cost_usd(model),
            model=model,
            mocked=False,
        )

    def edit(
        self,
        prompt: str,
        source_image_bytes: bytes,
        model: str = EDIT_MODEL,
        **kwargs,
    ) -> ImageResult:
        if not settings.NVIDIA_API_KEY:
            return ImageResult(
                image_bytes=mock_image_bytes(prompt),
                cost_usd=estimate_image_cost_usd(model),
                model=model,
                mocked=True,
            )

        import requests

        auth_headers = {
            "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        asset_response = requests.post(
            NVIDIA_ASSETS_URL,
            headers=auth_headers,
            json={"contentType": "image/png", "description": "input image"},
            timeout=self.request_timeout_seconds,
        )
        asset_response.raise_for_status()
        asset_data = asset_response.json()
        asset_id = asset_data["assetId"]

        upload_response = requests.put(
            asset_data["uploadUrl"],
            data=source_image_bytes,
            headers={
                "Content-Type": "image/png",
                "x-amz-meta-nvcf-asset-description": "input image",
            },
            timeout=self.request_timeout_seconds,
        )
        upload_response.raise_for_status()

        response = requests.post(
            NVIDIA_GENAI_EDIT_URL,
            headers={**auth_headers, "NVCF-INPUT-ASSET-REFERENCES": asset_id},
            json={
                "prompt": prompt,
                "image": f"data:image/png;example_id,{asset_id}",
            },
            timeout=self.request_timeout_seconds,
        )
        response.raise_for_status()
        image_bytes = base64.b64decode(
            response.json()["artifacts"][0]["base64"]
        )

        return ImageResult(
            image_bytes=image_bytes,
            cost_usd=estimate_image_cost_usd(model),
            model=model,
            mocked=False,
        )
