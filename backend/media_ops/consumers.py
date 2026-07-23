import asyncio
import json
import time

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    usd_to_credits,
)
from media_ops.pricing import estimate_live_voice_cost_usd

# Минимум кредитов на старте — стоимость одной минуты живого разговора.
# Не гарантирует, что сессия не уйдёт в минус (списание идёт по факту
# длительности при отключении, не поминутно во время звонка), но
# отсекает совсем пустой баланс до того, как открыт дорогой сокет к
# Gemini.
MIN_MINUTES_BALANCE_CHECK = 1
# gemini-2.0-flash-live-001 (изначальный выбор) снят с v1beta bidiGenerateContent
# — подтверждено вживую через client.models.list() с реальным ключом
# пользователя: только gemini-2.5-flash-native-audio-latest,
# gemini-3.1-flash-live-preview и датированные preview-варианты поддерживают
# bidiGenerateContent сейчас. Взят "latest"-алиас, а не датированный preview,
# чтобы не привязываться к снимку, который тоже могут снять с поддержки.
GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"


class VoiceLiveConsumer(AsyncWebsocketConsumer):
    """Двусторонний ретранслятор аудио между браузером и Gemini Live API.
    Без GOOGLE_API_KEY уходит в мок-режим (тот же принцип, что и у всех
    остальных адаптеров проекта) — эхо-подтверждение вместо реального
    голосового ответа, чтобы WS/биллинг/фронтенд можно было проверить
    сквозным тестом без реального провайдера."""

    async def connect(self):
        # Устанавливаются до любой ранней проверки/return — disconnect()
        # всё равно вызывается даже для соединения, отклонённого на
        # первой же строке (например, анонимного), и должен отработать
        # безопасно, а не падать на несуществующем атрибуте.
        self.user = None
        self.start_time = None
        self._gemini_task = None
        self._session_cm = None
        self._session = None

        user = self.scope["user"]
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        account = await sync_to_async(get_or_create_account)(user)
        min_credits = usd_to_credits(
            estimate_live_voice_cost_usd(MIN_MINUTES_BALANCE_CHECK)
        )
        if account.balance < min_credits:
            await self.accept()
            await self.send(
                text_data=json.dumps(
                    {"type": "error", "message": "insufficient_credits"}
                )
            )
            await self.close(code=4002)
            return

        self.user = user
        self.start_time = None
        self._gemini_task = None
        self._session_cm = None
        self._session = None

        await self.accept()
        self.start_time = time.monotonic()

        if not settings.GOOGLE_API_KEY:
            await self.send(text_data=json.dumps({"type": "ready", "mocked": True}))
            return

        try:
            await self._connect_gemini()
            await self.send(text_data=json.dumps({"type": "ready", "mocked": False}))
        except Exception:
            await self.send(
                text_data=json.dumps(
                    {"type": "error", "message": "provider_unavailable"}
                )
            )
            await self.close(code=4003)

    async def _connect_gemini(self):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        config = types.LiveConnectConfig(response_modalities=["AUDIO"])
        self._session_cm = client.aio.live.connect(
            model=GEMINI_LIVE_MODEL, config=config
        )
        self._session = await self._session_cm.__aenter__()
        self._gemini_task = asyncio.create_task(self._relay_from_gemini())

    async def _relay_from_gemini(self):
        try:
            async for message in self._session.receive():
                data = getattr(message, "data", None)
                if data:
                    await self.send(bytes_data=data)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Сбой у провайдера посреди разговора не должен уронить сам
            # consumer/websocket — отключение всё равно спишет по факту
            # уже состоявшейся длительности в disconnect().
            pass

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data:
            return
        if self._session:
            from google.genai import types

            await self._session.send_realtime_input(
                audio=types.Blob(data=bytes_data, mime_type="audio/pcm;rate=16000")
            )
        else:
            # Мок-режим.
            await self.send(
                text_data=json.dumps({"type": "mock_ack", "bytes": len(bytes_data)})
            )

    async def disconnect(self, code):
        if self._gemini_task:
            self._gemini_task.cancel()
        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception:
                pass
        if self.start_time is not None:
            elapsed_minutes = (time.monotonic() - self.start_time) / 60
            await self._charge_for_session(elapsed_minutes)

    async def _charge_for_session(self, minutes: float) -> None:
        if minutes <= 0:
            return
        cost_credits = usd_to_credits(estimate_live_voice_cost_usd(minutes))
        if cost_credits <= 0:
            return
        try:
            await sync_to_async(charge_credits)(
                self.user,
                cost_credits,
                reason=LedgerEntry.Reason.LIVE_VOICE_SESSION,
            )
        except InsufficientCreditsError:
            # Разговор уже состоялся — довзыскать нечем. Пропускаем,
            # а не пытаемся откатить уже потреблённый голосовой трафик.
            pass
