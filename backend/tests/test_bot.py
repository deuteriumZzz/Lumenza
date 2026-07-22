import asyncio
import io
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from django.contrib.auth import get_user_model
from PIL import Image

from billing.models import CreditAccount
from bot.handlers import (
    on_balance,
    on_describe_prompt,
    on_document,
    on_image,
    on_invite,
    on_photo_analysis,
    on_photo_edit,
    on_start,
    on_task_selected,
    on_text,
    on_voice,
)
from bot.services import get_or_create_telegram_user
from core.validators import (
    MAX_AUDIO_UPLOAD_BYTES,
    MAX_DOCUMENT_UPLOAD_BYTES,
    MAX_IMAGE_UPLOAD_BYTES,
)
from imagegen.models import GeneratedImage
from providers.models import RequestLog
from referrals.models import Referral

User = get_user_model()

# transaction=True (в стиле TransactionTestCase): обработчики работают
# через sync_to_async, который выполняет запросы к БД в отдельном потоке
# со своим собственным соединением. При стандартном django_db
# (atomic-блок, никогда не коммитящийся в соединении главного потока)
# запросы этого второго потока блокируются на незакоммиченной транзакции
# главного потока, а цикл событий главного потока блокируется в ожидании
# того же самого потока — взаимная блокировка. transaction=True
# заставляет каждый тест реально коммитить/усекать таблицы вместо этого.
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


def _make_command(args=None):
    command = MagicMock()
    command.args = args
    return command


def _valid_png_bytes():
    output = io.BytesIO()
    Image.new("RGB", (2, 2), color="blue").save(output, format="PNG")
    return output.getvalue()


def _make_photo_message(telegram_id=111, username="tester"):
    message = MagicMock()
    message.text = None
    message.caption = None
    message.photo = [MagicMock(file_id="photo_file_id", file_size=1024)]
    message.from_user = MagicMock(id=telegram_id, username=username)
    message.chat = MagicMock(id=telegram_id)
    message.answer = AsyncMock()
    message.bot.get_file = AsyncMock(
        return_value=MagicMock(file_path="path/to/photo.jpg")
    )
    downloaded = MagicMock()
    downloaded.read = MagicMock(return_value=_valid_png_bytes())
    message.bot.download_file = AsyncMock(return_value=downloaded)
    return message


def _make_voice_message(file_size, telegram_id=111):
    message = _make_message(telegram_id=telegram_id)
    message.voice = MagicMock(file_id="voice_file_id", file_size=file_size)
    message.bot.get_file = AsyncMock()
    message.bot.download_file = AsyncMock()
    return message


def _make_document_message(
    file_size,
    mime_type="image/png",
    file_name="document.png",
    telegram_id=111,
):
    message = _make_message(telegram_id=telegram_id)
    message.photo = None
    message.document = MagicMock(
        file_id="document_file_id",
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
    )
    message.bot.get_file = AsyncMock()
    message.bot.download_file = AsyncMock()
    return message


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


def test_on_start_greets_links_account_and_sets_default_task():
    message = _make_message(telegram_id=111)
    state = _make_state()

    asyncio.run(on_start(message, state, _make_command()))

    message.answer.assert_awaited_once()
    text = message.answer.await_args.args[0]
    assert "Welcome to Lumenza" in text

    user = User.objects.get(telegram_id=111)
    assert user.username == "tg_111"
    state.update_data.assert_awaited_once_with(task="repurpose")


def test_on_start_with_referral_deep_link_records_referral():
    referrer, _ = get_or_create_telegram_user(900, "referrer")
    message = _make_message(telegram_id=901)
    state = _make_state()

    asyncio.run(
        on_start(message, state, _make_command(args=f"ref_{referrer.id}"))
    )

    referred = User.objects.get(telegram_id=901)
    referral = Referral.objects.get(referred=referred)
    assert referral.referrer_id == referrer.id
    assert referral.status == Referral.Status.PENDING


def test_on_start_returning_user_does_not_attach_new_referral():
    # Вернувшийся пользователь, повторно отправивший deep-ссылку
    # (например, снова тапнув старое сообщение-приглашение), не должен
    # прикреплять реферала задним числом.
    get_or_create_telegram_user(902, "returning")
    referrer, _ = get_or_create_telegram_user(903, "referrer2")
    message = _make_message(telegram_id=902)
    state = _make_state()

    asyncio.run(
        on_start(message, state, _make_command(args=f"ref_{referrer.id}"))
    )

    referred = User.objects.get(telegram_id=902)
    assert not Referral.objects.filter(referred=referred).exists()


def test_on_invite_returns_referral_link(settings):
    settings.TELEGRAM_BOT_USERNAME = "lumenza_test_bot"
    user, _ = get_or_create_telegram_user(904, "inviter")
    message = _make_message(telegram_id=904)

    asyncio.run(on_invite(message))

    message.answer.assert_awaited_once()
    text = message.answer.await_args.args[0]
    assert f"ref_{user.id}" in text
    assert "lumenza_test_bot" in text


def test_on_describe_prompt_arms_state_flag():
    message = _make_message(telegram_id=905)
    state = _make_state()

    asyncio.run(on_describe_prompt(message, state))

    message.answer.assert_awaited_once()
    state.update_data.assert_awaited_once_with(awaiting_photo_analysis=True)


def test_on_photo_analysis_starts_analysis_and_clears_flag():
    # photo_to_caption отсутствует в progression.services.BASE_FREE_KEYS
    # (заблокирована по умолчанию) — здесь PAID, чтобы проверить сам
    # поток анализа, та же конвенция, что и у _authed_client по
    # умолчанию в media_ops/tests.py.
    user, _ = get_or_create_telegram_user(906, "describer")
    user.tier = User.Tier.PAID
    user.save(update_fields=["tier"])
    message = _make_photo_message(telegram_id=906)
    state = _make_state({"awaiting_photo_analysis": True})

    asyncio.run(on_photo_analysis(message, state))

    state.update_data.assert_awaited_once_with(awaiting_photo_analysis=False)
    message.answer.assert_awaited_once()
    text = message.answer.await_args.args[0]
    assert "caption idea" in text.lower()

    from media_ops.models import PhotoAnalysis

    record = PhotoAnalysis.objects.get(user__telegram_id=906)
    assert record.status == PhotoAnalysis.Status.OK
    assert record.telegram_chat_id == 906


def test_on_voice_rejects_oversized_upload_before_download():
    message = _make_voice_message(MAX_AUDIO_UPLOAD_BYTES + 1)

    asyncio.run(on_voice(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "too large" in message.answer.await_args.args[0].lower()


def test_on_voice_rejects_upload_when_size_cannot_be_verified():
    message = _make_voice_message(None)
    message.bot.get_file.return_value = MagicMock(
        file_path="path/to/voice.ogg", file_size=None
    )

    asyncio.run(on_voice(message))

    message.bot.get_file.assert_awaited_once()
    message.bot.download_file.assert_not_awaited()
    assert "verify" in message.answer.await_args.args[0].lower()


def test_on_voice_rejects_file_without_download_path():
    message = _make_voice_message(1024)
    message.bot.get_file.return_value = MagicMock(
        file_path=None, file_size=1024
    )

    asyncio.run(on_voice(message))

    message.bot.download_file.assert_not_awaited()
    assert "download" in message.answer.await_args.args[0].lower()


def test_on_voice_rejects_download_larger_than_verified_metadata():
    message = _make_voice_message(1024)
    message.bot.get_file.return_value = MagicMock(
        file_path="path/to/voice.ogg", file_size=1024
    )
    downloaded = MagicMock()
    downloaded.read.return_value = b"x" * (MAX_AUDIO_UPLOAD_BYTES + 1)
    message.bot.download_file.return_value = downloaded

    asyncio.run(on_voice(message))

    message.bot.download_file.assert_awaited_once()
    assert "too large" in message.answer.await_args.args[0].lower()
    assert not User.objects.filter(telegram_id=111).exists()


def test_on_voice_caps_stream_while_downloading():
    message = _make_voice_message(1024)
    message.bot.get_file.return_value = MagicMock(
        file_path="path/to/voice.ogg", file_size=1024
    )

    async def oversized_download(_path, destination):
        destination.write(b"x" * (MAX_AUDIO_UPLOAD_BYTES + 1))
        return destination

    message.bot.download_file.side_effect = oversized_download

    asyncio.run(on_voice(message))

    assert "too large" in message.answer.await_args.args[0].lower()
    assert not User.objects.filter(telegram_id=111).exists()


def test_on_voice_rejects_missing_sender_before_download():
    message = _make_voice_message(1024)
    message.from_user = None

    asyncio.run(on_voice(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()


def test_on_photo_analysis_rejects_oversized_upload_and_clears_flag():
    message = _make_photo_message(telegram_id=907)
    message.photo[-1].file_size = MAX_IMAGE_UPLOAD_BYTES + 1
    state = _make_state({"awaiting_photo_analysis": True})

    asyncio.run(on_photo_analysis(message, state))

    state.update_data.assert_awaited_once_with(awaiting_photo_analysis=False)
    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "too large" in message.answer.await_args.args[0].lower()


def test_on_photo_analysis_rejects_missing_sender_before_download():
    message = _make_photo_message(telegram_id=9071)
    message.from_user = None
    state = _make_state({"awaiting_photo_analysis": True})

    asyncio.run(on_photo_analysis(message, state))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()


def test_on_photo_edit_rejects_oversized_upload_before_download():
    message = _make_photo_message(telegram_id=908)
    message.caption = "Make it brighter"
    message.photo[-1].file_size = MAX_IMAGE_UPLOAD_BYTES + 1

    asyncio.run(on_photo_edit(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "too large" in message.answer.await_args.args[0].lower()


def test_on_photo_edit_rejects_missing_sender_before_download():
    message = _make_photo_message(telegram_id=9081)
    message.caption = "Make it brighter"
    message.from_user = None

    asyncio.run(on_photo_edit(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()


def test_on_document_rejects_oversized_upload_before_download():
    message = _make_document_message(MAX_DOCUMENT_UPLOAD_BYTES + 1)

    asyncio.run(on_document(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "too large" in message.answer.await_args.args[0].lower()


def test_on_document_rejects_unsupported_file_type_before_download():
    message = _make_document_message(
        1024, mime_type="application/pdf", file_name="document.pdf"
    )

    asyncio.run(on_document(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "unsupported" in message.answer.await_args.args[0].lower()


def test_on_document_rejects_spoofed_image_extension_before_download():
    message = _make_document_message(
        1024, mime_type="application/pdf", file_name="spoof.png"
    )

    asyncio.run(on_document(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()
    assert "unsupported" in message.answer.await_args.args[0].lower()


def test_on_document_rejects_missing_sender_before_download():
    message = _make_document_message(1024, telegram_id=9091)
    message.from_user = None

    asyncio.run(on_document(message))

    message.bot.get_file.assert_not_awaited()
    message.bot.download_file.assert_not_awaited()


def test_on_document_rejects_invalid_image_content():
    message = _make_document_message(1024, telegram_id=9092)
    message.bot.get_file.return_value = MagicMock(
        file_path="path/to/document.png", file_size=1024
    )
    downloaded = MagicMock()
    downloaded.read.return_value = b"not-an-image"
    message.bot.download_file.return_value = downloaded

    asyncio.run(on_document(message))

    assert "invalid image" in message.answer.await_args.args[0].lower()
    assert not User.objects.filter(telegram_id=9092).exists()


def test_on_balance_reports_current_balance():
    get_or_create_telegram_user(222, "bal")
    message = _make_message(telegram_id=222)

    asyncio.run(on_balance(message))

    message.answer.assert_awaited_once()
    assert "credits" in message.answer.await_args.args[0]


def test_on_balance_rejects_update_without_sender():
    message = _make_message()
    message.from_user = None

    asyncio.run(on_balance(message))

    assert "identify" in message.answer.await_args.args[0].lower()


def test_on_voice_rejects_update_without_voice_payload():
    message = _make_message()
    message.voice = None

    asyncio.run(on_voice(message))

    assert "voice" in message.answer.await_args.args[0].lower()


def test_on_voice_rejects_update_without_bot_context():
    message = _make_voice_message(1024)
    message.bot = None

    asyncio.run(on_voice(message))

    message.answer.assert_not_awaited()


def test_on_photo_edit_rejects_missing_caption_before_download():
    message = _make_photo_message()
    message.caption = None

    asyncio.run(on_photo_edit(message))

    message.bot.get_file.assert_not_awaited()
    assert "caption" in message.answer.await_args.args[0].lower()


def test_on_document_rejects_update_without_upload():
    message = _make_message()
    message.document = None
    message.photo = None

    asyncio.run(on_document(message))

    assert "upload" in message.answer.await_args.args[0].lower()


def test_on_text_runs_chat_and_reports_cost():
    message = _make_message(text="hello there", telegram_id=333)
    state = _make_state({"task": "repurpose"})

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


def test_on_text_ignores_update_without_text():
    message = _make_message(text=None, telegram_id=445)
    state = _make_state()

    asyncio.run(on_text(message, state))

    message.answer.assert_not_awaited()


def test_on_text_reports_moderation_block_without_charging():
    message = _make_message(text="child sexual content", telegram_id=888)
    state = _make_state({"task": "repurpose"})

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
    # CELERY_TASK_ALWAYS_EAGER означает, что задача уже выполнилась
    # синхронно.
    assert record.status == GeneratedImage.Status.OK


def test_on_image_without_prompt_shows_usage_and_does_not_charge():
    message = _make_message(telegram_id=777)
    command = MagicMock(args=None)

    asyncio.run(on_image(message, command))

    message.answer.assert_awaited_once_with(
        "Usage: /image a description of the visual you want"
    )
    assert not GeneratedImage.objects.filter(user__telegram_id=777).exists()


def test_on_task_selected_updates_state_and_acknowledges():
    # "hashtags" бесплатна по умолчанию
    # (progression.services.BASE_FREE_KEYS), так что это проверяет
    # счастливый путь без необходимости ещё и разблокировать.
    callback = MagicMock()
    callback.data = "task:hashtags"
    callback.from_user = MagicMock(id=1001, username="task_selector")
    callback.answer = AsyncMock()
    callback.message = MagicMock()
    callback.message.edit_reply_markup = AsyncMock()
    state = _make_state()

    asyncio.run(on_task_selected(callback, state))

    state.update_data.assert_awaited_once_with(task="hashtags")
    callback.answer.assert_awaited_once()
    callback.message.edit_reply_markup.assert_awaited_once()


def test_on_task_selected_rejects_locked_task():
    # "hook" не бесплатна по умолчанию, так что свежий пользователь пока
    # не может её выбрать.
    callback = MagicMock()
    callback.data = "task:hook"
    callback.from_user = MagicMock(id=1002, username="locked_selector")
    callback.answer = AsyncMock()
    callback.message = MagicMock()
    callback.message.edit_reply_markup = AsyncMock()
    state = _make_state()

    asyncio.run(on_task_selected(callback, state))

    state.update_data.assert_not_awaited()
    callback.answer.assert_awaited_once_with(
        "Not unlocked on your plan yet", show_alert=True
    )
    callback.message.edit_reply_markup.assert_not_awaited()


def test_on_task_selected_rejects_missing_callback_data():
    callback = MagicMock()
    callback.data = None
    callback.answer = AsyncMock()
    state = _make_state()

    asyncio.run(on_task_selected(callback, state))

    callback.answer.assert_awaited_once_with("Unknown task", show_alert=True)


def _telegram_update_payload(
    update_id=1, chat_id=999, user_id=999, text="/balance"
):
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


def test_webhook_accepts_valid_request_and_feeds_the_dispatcher(
    client, settings, monkeypatch
):
    settings.TELEGRAM_WEBHOOK_SECRET = "correct-secret"

    fake_dispatcher = MagicMock()
    fake_dispatcher.feed_update = AsyncMock()
    import bot.views as views_module

    monkeypatch.setattr(
        views_module, "_get_dispatcher", lambda: fake_dispatcher
    )
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
