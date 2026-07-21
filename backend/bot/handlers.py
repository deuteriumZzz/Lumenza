from decimal import Decimal

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.files.base import ContentFile

from billing.services import (
    cancel_subscription,
    get_or_create_account,
    start_subscription,
)
from bot.services import get_or_create_telegram_user
from imagegen.services import start_image_edit, start_image_generation
from media_ops.services import (
    start_document_extraction,
    start_photo_analysis,
    start_transcription,
)
from progression.services import get_unlocked_keys
from providers.services import TASK_ROUTES, run_chat
from referrals.services import record_referral, referral_link_for

router = Router(name="lumenza")

TASKS = list(TASK_ROUTES.keys())
DEFAULT_TASK = "repurpose"
# Команды бота генерируют изображения только через маршрут
# "illustration" — веб-интерфейс это то место, где пользователь
# осознанно выбирает между категориями задач изображений; /image это
# быстрый единственный вариант по умолчанию, а не дублирование того же
# выбора здесь. Должен оставаться одним из
# progression.services.BASE_FREE_KEYS, чтобы первая команда /image у
# совершенно нового FREE-пользователя никогда не была заблокирована.
DEFAULT_IMAGE_TASK = "illustration"


def _task_keyboard(current: str, unlocked: frozenset) -> InlineKeyboardMarkup:
    buttons = [
        InlineKeyboardButton(
            text=(
                "✓ "
                if task == current
                else "🔒 " if task not in unlocked else ""
            )
            + task,
            callback_data=f"task:{task}",
        )
        for task in TASKS
    ]
    # По 3 в ряд делает 6 категорий читаемыми вместо одного длинного
    # нечитаемого ряда.
    rows = [buttons[i : i + 3] for i in range(0, len(buttons), 3)]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _is_plain_text(message: Message) -> bool:
    # Обычный вызываемый фильтр, а не цепочка magic-filter от aiogram —
    # избегает зависимости от того, как ведёт себя
    # `F.text.startswith(...)`, когда text равен None (нетекстовые
    # сообщения: фото, стикеры и т.д.).
    return bool(message.text) and not message.text.startswith("/")


async def _awaiting_photo_analysis(
    message: Message, state: FSMContext
) -> bool:
    # Декларативный фильтр, а не ветка внутри on_photo_edit/on_document
    # — соответствует уже принятому в проекте стилю (_is_plain_text
    # выше). Когда возвращает False, aiogram переходит к следующему
    # зарегистрированному обработчику (on_photo_edit, затем
    # on_document), так что одноразовое "взведение" /describe на
    # "следующее фото" вообще не требует трогать ни один из этих
    # обработчиков.
    if message.photo is None:
        return False
    data = await state.get_data()
    return bool(data.get("awaiting_photo_analysis"))


@router.message(CommandStart())
async def on_start(
    message: Message, state: FSMContext, command: CommandObject
) -> None:
    user, created = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    if created and command.args:
        # Прикрепить реферала может только совершенно новый пользователь
        # — почему это делает "один бонус на аккаунт" структурным
        # свойством, а не отдельно проверяемым условием, см. докстринг
        # referrals/services.py record_referral.
        await sync_to_async(record_referral)(user, command.args)
    account = await sync_to_async(get_or_create_account)(user)
    await state.update_data(task=DEFAULT_TASK)
    unlocked = await sync_to_async(get_unlocked_keys)(user)
    greeting = "Welcome to Lumenza!" if created else "Welcome back!"
    await message.answer(
        f"{greeting}\nBalance: {account.balance} credits.\n\n"
        "Send a message for a caption, post, or content idea — or use "
        "/image <prompt> for a visual. Pick a task below:",
        reply_markup=_task_keyboard(DEFAULT_TASK, unlocked),
    )


@router.message(Command("invite"))
async def on_invite(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    link = await sync_to_async(referral_link_for)(user)
    await message.answer(
        "Invite friends and you'll both get bonus credits once they "
        f"try Lumenza:\n{link}"
    )


@router.message(Command("balance"))
async def on_balance(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id
    )
    account = await sync_to_async(get_or_create_account)(user)
    await message.answer(f"Balance: {account.balance} credits.")


@router.message(Command("task"))
async def on_task(message: Message, state: FSMContext) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    data = await state.get_data()
    current = data.get("task", DEFAULT_TASK)
    unlocked = await sync_to_async(get_unlocked_keys)(user)
    await message.answer(
        "Pick a task:", reply_markup=_task_keyboard(current, unlocked)
    )


@router.callback_query(
    lambda callback: (callback.data or "").startswith("task:")
)
async def on_task_selected(callback: CallbackQuery, state: FSMContext) -> None:
    task = callback.data.split(":", 1)[1]
    if task not in TASKS:
        await callback.answer("Unknown task", show_alert=True)
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        callback.from_user.id, callback.from_user.username or ""
    )
    unlocked = await sync_to_async(get_unlocked_keys)(user)
    if task not in unlocked:
        await callback.answer("Not unlocked on your plan yet", show_alert=True)
        return

    await state.update_data(task=task)
    if callback.message is not None:
        await callback.message.edit_reply_markup(
            reply_markup=_task_keyboard(task, unlocked)
        )
    await callback.answer(f"Task set to {task}")


@router.message(Command("image"))
async def on_image(message: Message, command: CommandObject) -> None:
    prompt = (command.args or "").strip()
    if not prompt:
        await message.answer(
            "Usage: /image a description of the visual you want"
        )
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    outcome = await sync_to_async(start_image_generation)(
        user, prompt, DEFAULT_IMAGE_TASK, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "This visual style isn't unlocked on your plan yet."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Image generation is temporarily unavailable — please try "
            "again shortly."
        )
    else:
        await message.answer(
            "Generating your image — I'll send it here when it's ready."
        )


@router.message(Command("subscribe"))
async def on_subscribe(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    outcome = await sync_to_async(start_subscription)(
        user, Decimal(str(settings.PRO_SUBSCRIPTION_PRICE_RUB))
    )

    if outcome.status == "already_subscribed":
        await message.answer("You're already subscribed to Pro.")
    elif outcome.status == "unavailable":
        await message.answer("Subscriptions aren't available right now.")
    else:
        await message.answer(
            f"Complete your subscription here:\n{outcome.confirmation_url}"
        )


@router.message(Command("unsubscribe"))
async def on_unsubscribe(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    canceled = await sync_to_async(cancel_subscription)(user)
    if canceled:
        await message.answer("Your Pro subscription has been canceled.")
    else:
        await message.answer("You don't have an active subscription.")


@router.message(F.voice)
async def on_voice(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    file = await message.bot.get_file(message.voice.file_id)
    audio_bytes = await message.bot.download_file(file.file_path)
    audio_file = ContentFile(audio_bytes.read(), name="voice.ogg")

    outcome = await sync_to_async(start_transcription)(
        user, audio_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "Voice transcription isn't unlocked on your plan yet."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Transcription is temporarily unavailable — please try "
            "again shortly."
        )
    else:
        await message.answer(
            "Transcribing your voice note — I'll send the text here "
            "when it's ready."
        )


@router.message(Command("describe"))
async def on_describe_prompt(message: Message, state: FSMContext) -> None:
    await state.update_data(awaiting_photo_analysis=True)
    await message.answer(
        "Send me a photo and I'll write a caption idea for it."
    )


@router.message(_awaiting_photo_analysis)
async def on_photo_analysis(message: Message, state: FSMContext) -> None:
    await state.update_data(awaiting_photo_analysis=False)
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    file = await message.bot.get_file(message.photo[-1].file_id)
    image_bytes = await message.bot.download_file(file.file_path)
    image_file = ContentFile(image_bytes.read(), name="photo.jpg")

    outcome = await sync_to_async(start_photo_analysis)(
        user, image_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer("Photo analysis isn't unlocked on your plan yet.")
    elif outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Photo analysis is temporarily unavailable — please try "
            "again shortly."
        )
    else:
        await message.answer(
            "Looking at your photo — I'll send a caption idea here "
            "when it's ready."
        )


@router.message(F.photo, F.caption)
async def on_photo_edit(message: Message) -> None:
    # Зарегистрирован перед обычным обработчиком document/photo ниже,
    # чтобы фото С подписью трактовалось как "отредактируй это фото,
    # используя подпись как промпт" — фото без подписи всё равно
    # проваливается дальше в OCR.
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    file = await message.bot.get_file(message.photo[-1].file_id)
    image_bytes = await message.bot.download_file(file.file_path)
    image_file = ContentFile(image_bytes.read(), name="source.jpg")

    outcome = await sync_to_async(start_image_edit)(
        user,
        message.caption.strip(),
        image_file,
        telegram_chat_id=message.chat.id,
    )

    if outcome.status == "task_locked":
        await message.answer("Image editing isn't unlocked on your plan yet.")
    elif outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Image editing is temporarily unavailable — please try "
            "again shortly."
        )
    else:
        await message.answer(
            "Editing your photo — I'll send the result here when "
            "it's ready."
        )


@router.message(F.document | F.photo)
async def on_document(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    # Сообщение с фото содержит несколько разрешений; последнее —
    # самое большое.
    file_id = (
        message.document.file_id
        if message.document
        else message.photo[-1].file_id
    )
    filename = message.document.file_name if message.document else "photo.jpg"

    file = await message.bot.get_file(file_id)
    document_bytes = await message.bot.download_file(file.file_path)
    document_file = ContentFile(document_bytes.read(), name=filename)

    outcome = await sync_to_async(start_document_extraction)(
        user, document_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "Document extraction isn't unlocked on your plan yet."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Extraction is temporarily unavailable — please try again shortly."
        )
    else:
        await message.answer(
            "Reading your document — I'll send the extracted text "
            "here when it's ready."
        )


@router.message(_is_plain_text)
async def on_text(message: Message, state: FSMContext) -> None:
    prompt = message.text.strip()
    if not prompt:
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    data = await state.get_data()
    task = data.get("task", DEFAULT_TASK)

    outcome = await sync_to_async(run_chat)(user, prompt, task)

    if outcome.status == "task_locked":
        await message.answer(
            "This task isn't unlocked on your plan yet. Send /task "
            "to see options."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer(
            "Not enough credits for this request. Top up in the web "
            "app to continue."
        )
    elif outcome.status == "provider_error":
        await message.answer(
            "Every provider for this task failed. Nothing was charged."
        )
    elif outcome.status == "blocked":
        await message.answer(
            "That message was blocked by moderation. Nothing was charged."
        )
    else:
        await message.answer(
            f"{outcome.text}\n\n— {outcome.provider}/{outcome.model} "
            f"({task}) · {outcome.credits_charged} credits · "
            f"balance {outcome.balance}"
        )
