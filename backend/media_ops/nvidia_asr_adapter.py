import subprocess

from django.conf import settings

from media_ops.base import TranscriptionResult
from media_ops.pricing import estimate_transcription_cost_usd

DEFAULT_MODEL = "nvidia/canary-1b-asr"

# ПОДТВЕРЖДЕНО РАБОТАЕТ — REST-запрос в стиле genai, который этот
# адаптер пробовал раньше, отдавал 404; NIM-модели ASR/TTS семейства
# Riva от NVIDIA доступны только через gRPC, через пакет
# nvidia-riva-client. Подтверждено вживую сквозным тестом: реально
# синтезированная TTS-речь ("This audio is generated from NVIDIA's text
# to speech model.") была прогнана через ровно этот путь вызова и
# вернула корректную транскрипцию. gRPC-хост и "function-id" для каждой
# модели не указаны на собственной (REST-ориентированной) вкладке API на
# build.nvidia.com — найдены вместо этого в примерах скриптов
# Riva-клиента от NVIDIA.
RIVA_SERVER = "grpc.nvcf.nvidia.com:443"
FUNCTION_ID = "b0e8b4a5-217c-40b7-9b96-17d84e666317"

TARGET_SAMPLE_RATE_HZ = 16000


class NvidiaAsrAdapter:
    name = "nvidia"
    request_timeout_seconds = 30.0

    def transcribe(
        self, audio_bytes: bytes, model: str = DEFAULT_MODEL, **kwargs
    ) -> TranscriptionResult:
        if not settings.NVIDIA_API_KEY:
            return self._mock_result(model)

        import riva.client

        pcm_bytes = self._to_pcm_bytes(audio_bytes)

        auth = riva.client.Auth(
            uri=RIVA_SERVER,
            use_ssl=True,
            metadata_args=[
                ["function-id", FUNCTION_ID],
                ["authorization", f"Bearer {settings.NVIDIA_API_KEY}"],
            ],
        )
        asr_service = riva.client.ASRService(auth)
        config = riva.client.RecognitionConfig(
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            language_code="en-US",
            max_alternatives=1,
            sample_rate_hertz=TARGET_SAMPLE_RATE_HZ,
            audio_channel_count=1,
        )
        response = asr_service.offline_recognize(pcm_bytes, config)
        text = " ".join(
            result.alternatives[0].transcript
            for result in response.results
            if result.alternatives
        ).strip()

        return TranscriptionResult(
            text=text,
            cost_usd=estimate_transcription_cost_usd(model),
            model=model,
            mocked=False,
        )

    def _to_pcm_bytes(self, audio_bytes: bytes) -> bytes:
        """Голосовые сообщения Telegram — это OGG/Opus, записи из браузера —
        WebM/Opus, а прямая загрузка файла может быть почти чем угодно —
        вместо того чтобы обрабатывать каждый контейнер отдельно, всегда
        транскодируем в единственный формат, который Riva подтверждённо
        корректно принимает: моно 16кГц 16-бит raw PCM (совпадает с
        TARGET_SAMPLE_RATE_HZ/RecognitionConfig выше)."""
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                "pipe:0",
                "-ar",
                str(TARGET_SAMPLE_RATE_HZ),
                "-ac",
                "1",
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            timeout=self.request_timeout_seconds,
            check=True,
        )
        return result.stdout

    def _mock_result(self, model: str) -> TranscriptionResult:
        return TranscriptionResult(
            text="[mock transcription]",
            cost_usd=estimate_transcription_cost_usd(model),
            model=model,
            mocked=True,
        )
