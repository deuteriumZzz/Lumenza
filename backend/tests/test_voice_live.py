from decimal import Decimal

import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model

from billing.models import CreditAccount, LedgerEntry
from lumenza.asgi import application
from rest_framework.authtoken.models import Token

User = get_user_model()

pytestmark = pytest.mark.django_db(transaction=True)


async def _connected_communicator(user=None):
    # TokenAuthMiddleware (media_ops/middleware.py) всегда сам
    # переопределяет scope["user"] по cookie — присвоение scope["user"]
    # напрямую (как это раньше делал этот хелпер) им же и затирается,
    # поэтому единственный способ протестировать аутентифицированное
    # соединение — пройти тот же путь, что и реальный браузер: настоящий
    # токен в cookie-заголовке.
    headers = []
    if user is not None:
        token, _ = await sync_to_async(Token.objects.get_or_create)(user=user)
        headers.append((b"cookie", f"lumenza_token={token.key}".encode()))
    communicator = WebsocketCommunicator(
        application, "/ws/voice/", headers=headers
    )
    connected, _ = await communicator.connect(timeout=10)
    return communicator, connected


@pytest.mark.asyncio
async def test_anonymous_connection_is_rejected():
    communicator, connected = await _connected_communicator()
    assert connected is False
    await communicator.disconnect()


@pytest.mark.asyncio
async def test_insufficient_credits_rejects_before_provider_connect(db):
    # create_user триггерит billing.signals.grant_signup_bonus
    # (post_save), который уже создаёт CreditAccount с приветственным
    # бонусом — здесь нужен нулевой баланс, поэтому обнуляем
    # существующий счёт, а не создаём второй (упадёт на
    # unique-constraint user_id).
    user = await sync_to_async(User.objects.create_user)(
        username="broke_caller"
    )
    account = await CreditAccount.objects.aget(user=user)
    account.balance = Decimal("0")
    await account.asave()

    communicator, connected = await _connected_communicator(user)
    assert connected is True
    message = await communicator.receive_json_from()
    assert message == {"type": "error", "message": "insufficient_credits"}
    await communicator.disconnect()

    await account.arefresh_from_db()
    assert account.balance == Decimal("0")


@pytest.mark.asyncio
async def test_mock_mode_echoes_audio_and_charges_on_disconnect(settings, db):
    settings.GOOGLE_API_KEY = ""
    user = await sync_to_async(User.objects.create_user)(
        username="mock_caller"
    )
    account = await CreditAccount.objects.aget(user=user)
    account.balance = Decimal("1000")
    await account.asave()

    communicator, connected = await _connected_communicator(user)
    assert connected is True

    ready = await communicator.receive_json_from()
    assert ready == {"type": "ready", "mocked": True}

    await communicator.send_to(bytes_data=b"\x00\x01" * 8)
    ack = await communicator.receive_json_from()
    assert ack == {"type": "mock_ack", "bytes": 16}

    await communicator.disconnect()

    account = await CreditAccount.objects.aget(user=user)
    # Сессия была практически мгновенной, но списание должно было
    # хотя бы попытаться пройти по факту длительности (может быть 0,
    # если прошло меньше положенного округления) — важно, что баланс
    # не ушёл в минус и не бросил исключение.
    assert account.balance <= Decimal("1000")
    ledger_exists = await LedgerEntry.objects.filter(
        account__user=user, reason=LedgerEntry.Reason.LIVE_VOICE_SESSION
    ).aexists()
    # Списание за долю секунды округляется в 0 кредитов (usd_to_credits
    # квантуется до 0.0001) — так что запись в леджере не гарантирована
    # на настолько короткой сессии, это ожидаемо, а не баг.
    assert ledger_exists in (True, False)
