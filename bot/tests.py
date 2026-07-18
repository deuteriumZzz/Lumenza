import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from django.contrib.auth import get_user_model

from billing.models import CreditAccount
from bot.handlers import on_balance, on_image, on_mode_selected, on_start, on_text
from bot.services import get_or_create_telegram_user
from imagegen.models import GeneratedImage
from providers.models import RequestLog

User = get_user_model()

# transaction=True (TransactionTestCase-style): handlers run through
# sync_to_async, which executes DB queries on a separate thread with its
# own connection. Under the default django_db (an atomic block never
# committed on the main thread's connection), that second thread's queries
# block on the main thread's uncommitted transaction while the main
# thread's event loop blocks waiting on that same thread — a deadlock.
# transaction=True makes each test commit/truncate for real instead.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


def _make_message(text=None, telegram_id=111, username="tester"):
    message = MagicMock()
    message.text = text
    message.from_user = MagicMock(id=telegram_id, username=username)
    message.chat = MagicMock(id=telegram_id)
    message.answer = AsyncMock()
    return message


def _make_state(data=None):
    state = MagicMock()
    state.get_data = AsyncMock(return_value=data or {})
    state.update_data = AsyncMock()
    return state


def test_get_or_create_telegram_user_grants_signup_bonus():
    user, created = get_or_create_telegram_user(555, "newbie")
    assert created is True
    assert user.telegram_id == 555
    assert not user.has_usable_password()
    account = CreditAccount.objects.get(user=user)
    assert account.balance > 0

    user2, created2 = get_or_create_telegram_user(555, "newbie")
    assert created2 is False
    assert user2.id == user.id


def test_on_start_greets_links_account_and_sets_default_mode():
    message = _make_message(telegram_id=111)
    state = _make_state()

    asyncio.run(on_start(message, state))

    message.answer.assert_awaited_once()
    text = message.answer.await_args.args[0]
    assert "Welcome to Lumenza" in text

    user = User.objects.get(telegram_id=111)
    assert user.username == "tg_111"
    state.update_data.assert_awaited_once_with(mode="fast")


def test_on_balance_reports_current_balance():
    get_or_create_telegram_user(222, "bal")
    message = _make_message(telegram_id=222)

    asyncio.run(on_balance(message))

    message.answer.assert_awaited_once()
    assert "credits" in message.answer.await_args.args[0]


def test_on_text_runs_chat_and_reports_cost():
    message = _make_message(text="hello there", telegram_id=333)
    state = _make_state({"mode": "fast"})

    asyncio.run(on_text(message, state))

    message.answer.assert_awaited_once()
    reply = message.answer.await_args.args[0]
    assert "openai" in reply
    assert "credits" in reply

    user = User.objects.get(telegram_id=333)
    assert RequestLog.objects.filter(user=user, status="ok").exists()


def test_on_text_ignores_blank_message():
    message = _make_message(text="   ", telegram_id=444)
    state = _make_state()

    asyncio.run(on_text(message, state))

    message.answer.assert_not_awaited()


def test_on_text_reports_moderation_block_without_charging():
    message = _make_message(text="child sexual content", telegram_id=888)
    state = _make_state({"mode": "fast"})

    asyncio.run(on_text(message, state))

    message.answer.assert_awaited_once()
    assert "blocked" in message.answer.await_args.args[0].lower()

    user = User.objects.get(telegram_id=888)
    assert RequestLog.objects.filter(user=user, status="blocked").exists()


def test_on_image_command_starts_generation_for_the_telegram_chat():
    message = _make_message(telegram_id=666)
    command = MagicMock(args="a sunset over mountains")

    asyncio.run(on_image(message, command))

    message.answer.assert_awaited_once()
    assert "Generating" in message.answer.await_args.args[0]

    user = User.objects.get(telegram_id=666)
    record = GeneratedImage.objects.get(user=user)
    assert record.telegram_chat_id == 666
    # CELERY_TASK_ALWAYS_EAGER means the task already ran synchronously.
    assert record.status == GeneratedImage.Status.OK


def test_on_image_without_prompt_shows_usage_and_does_not_charge():
    message = _make_message(telegram_id=777)
    command = MagicMock(args=None)

    asyncio.run(on_image(message, command))

    message.answer.assert_awaited_once_with("Usage: /image a description of what to generate")
    assert not GeneratedImage.objects.filter(user__telegram_id=777).exists()


def test_on_mode_selected_updates_state_and_acknowledges():
    callback = MagicMock()
    callback.data = "mode:smart"
    callback.answer = AsyncMock()
    callback.message = MagicMock()
    callback.message.edit_reply_markup = AsyncMock()
    state = _make_state()

    asyncio.run(on_mode_selected(callback, state))

    state.update_data.assert_awaited_once_with(mode="smart")
    callback.answer.assert_awaited_once()
    callback.message.edit_reply_markup.assert_awaited_once()


def _telegram_update_payload(update_id=1, chat_id=999, user_id=999, text="/balance"):
    return {
        "update_id": update_id,
        "message": {
            "message_id": 1,
            "date": 1700000000,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": user_id, "is_bot": False, "first_name": "Test"},
            "text": text,
        },
    }


def test_webhook_rejects_wrong_secret_in_path(client, settings):
    settings.TELEGRAM_WEBHOOK_SECRET = "correct-secret"
    response = client.post(
        "/bot/webhook/wrong-secret/",
        data=json.dumps(_telegram_update_payload()),
        content_type="application/json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="correct-secret",
    )
    assert response.status_code == 403


def test_webhook_rejects_missing_header_token(client, settings):
    settings.TELEGRAM_WEBHOOK_SECRET = "correct-secret"
    response = client.post(
        "/bot/webhook/correct-secret/",
        data=json.dumps(_telegram_update_payload()),
        content_type="application/json",
    )
    assert response.status_code == 403


def test_webhook_rejects_when_no_secret_configured(client, settings):
    settings.TELEGRAM_WEBHOOK_SECRET = ""
    response = client.post(
        "/bot/webhook/anything/",
        data=json.dumps(_telegram_update_payload()),
        content_type="application/json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="anything",
    )
    assert response.status_code == 403


def test_webhook_accepts_valid_request_and_feeds_the_dispatcher(client, settings, monkeypatch):
    settings.TELEGRAM_WEBHOOK_SECRET = "correct-secret"

    fake_dispatcher = MagicMock()
    fake_dispatcher.feed_update = AsyncMock()
    import bot.views as views_module

    monkeypatch.setattr(views_module, "_get_dispatcher", lambda: fake_dispatcher)
    monkeypatch.setattr(views_module, "_get_bot", lambda: MagicMock())

    response = client.post(
        "/bot/webhook/correct-secret/",
        data=json.dumps(_telegram_update_payload(text="/balance")),
        content_type="application/json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="correct-secret",
    )

    assert response.status_code == 200
    fake_dispatcher.feed_update.assert_awaited_once()
    fed_update = fake_dispatcher.feed_update.await_args.args[1]
    assert fed_update.update_id == 1
