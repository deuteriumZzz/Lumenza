import subprocess

from django.conf import settings

from media_ops.base import SpeechResult
from media_ops.pricing import estimate_speech_cost_usd

DEFAULT_MODEL = "nvidia/magpie-tts-multilingual"
DEFAULT_VOICE = "Magpie-Multilingual.EN-US.Aria"

# ПОДТВЕРЖДЕНО РАБОТАЕТ — та же история "REST даёт 404 -> gRPC
# работает", см. докстринг nvidia_asr_adapter.py; function-id/сервер для
# этой модели найдены тем же способом (в примерах скриптов Riva-клиента
# от NVIDIA, не на REST-ориентированной вкладке API на
# build.nvidia.com). Протестировано вживую: реально синтезированное
# аудио корректно прошло полный цикл через ASR-адаптер выше.
RIVA_SERVER = "grpc.nvcf.nvidia.com:443"
FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"
SAMPLE_RATE_HZ = 44100


class NvidiaTtsAdapter:
    name = "nvidia"
    request_timeout_seconds = 30.0

    def synthesize(
        self, text: str, model: str = DEFAULT_MODEL, **kwargs
    ) -> SpeechResult:
        if not settings.NVIDIA_API_KEY:
            return self._mock_result(model)

        import riva.client

        auth = riva.client.Auth(
            uri=RIVA_SERVER,
            use_ssl=True,
            metadata_args=[
                ["function-id", FUNCTION_ID],
                ["authorization", f"Bearer {settings.NVIDIA_API_KEY}"],
            ],
        )
        tts_service = riva.client.SpeechSynthesisService(auth)
        response = tts_service.synthesize(
            text=text,
            voice_name=DEFAULT_VOICE,
            language_code="en-US",
            sample_rate_hz=SAMPLE_RATE_HZ,
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
        )
        mp3_bytes = self._pcm_to_mp3(response.audio)

        return SpeechResult(
            audio_bytes=mp3_bytes,
            cost_usd=estimate_speech_cost_usd(model),
            model=model,
            mocked=False,
        )

    def _pcm_to_mp3(self, pcm_bytes: bytes) -> bytes:
        """Riva возвращает сырой знаковый 16-битный PCM, а не контейнер/кодек,
        который остальная часть приложения может воспроизвести напрямую —
        media_ops/tasks.py всегда сохраняет результат как f"{id}.mp3", а
        веб-плеер и аудио-сообщение в Telegram оба ожидают реально
        воспроизводимый файл, поэтому транскодируем здесь, а не выносим
        обработку сырого PCM в каждого вызывающего."""
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "s16le",
                "-ar",
                str(SAMPLE_RATE_HZ),
                "-ac",
                "1",
                "-i",
                "pipe:0",
                "-f",
                "mp3",
                "pipe:1",
            ],
            input=pcm_bytes,
            capture_output=True,
            timeout=self.request_timeout_seconds,
            check=True,
        )
        return result.stdout

    def _mock_result(self, model: str) -> SpeechResult:
        # Крошечный валидный (тихий) MP3-фрейм, чтобы мок-путь всё равно
        # производил воспроизводимый файл, а не пустые/битые байты.
        silent_mp3 = bytes.fromhex(
            "fffb9004000000000000000000000000000000000000000000000000"
            "000000000000000000"
        )
        return SpeechResult(
            audio_bytes=silent_mp3,
            cost_usd=estimate_speech_cost_usd(model),
            model=model,
            mocked=True,
        )
