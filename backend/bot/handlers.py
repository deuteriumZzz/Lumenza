import io
from collections.abc import Buffer
from decimal import Decimal
from pathlib import Path

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery,
    InaccessibleMessage,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from aiogram.types import User as TelegramUser
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.files.base import ContentFile

from billing.services import (
    cancel_subscription,
    get_or_create_account,
    start_subscription,
)
from bot.services import get_or_create_telegram_user
from core.validators import (
    MAX_AUDIO_UPLOAD_BYTES,
    MAX_DOCUMENT_UPLOAD_BYTES,
    MAX_IMAGE_UPLOAD_BYTES,
)
from imagegen.services import start_image_edit, start_image_generation
from imagegen.validation import normalize_generated_image
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
SUPPORTED_DOCUMENT_MIME_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)
SUPPORTED_DOCUMENT_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


class _UploadTooLargeError(Exception):
    pass


class _LimitedDownload(io.BytesIO):
    def __init__(self, max_bytes: int):
        super().__init__()
        self.max_bytes = max_bytes

    def write(self, data: Buffer) -> int:
        if self.tell() + memoryview(data).nbytes > self.max_bytes:
            raise _UploadTooLargeError
        return super().write(data)


async def _reject_oversized_upload(
    message: Message, file_size: int | None, max_bytes: int
) -> bool:
    if isinstance(file_size, int) and file_size > max_bytes:
        await message.answer(
            f"Файл слишком большой. Максимальный размер — "
            f"{max_bytes // (1024 * 1024)} МБ."
        )
        return True
    return False


async def _get_verified_telegram_file(
    message: Message,
    file_id: str,
    reported_size: int | None,
    max_bytes: int,
):
    if await _reject_oversized_upload(message, reported_size, max_bytes):
        return None

    bot = message.bot
    if bot is None:
        return None
    file = await bot.get_file(file_id)
    verified_size = (
        file.file_size
        if isinstance(getattr(file, "file_size", None), int)
        else reported_size
    )
    if not isinstance(verified_size, int):
        await message.answer(
            "Не удалось проверить размер файла. Отправьте другой файл."
        )
        return None
    if await _reject_oversized_upload(message, verified_size, max_bytes):
        return None
    return file


async def _download_verified_upload(message: Message, file, max_bytes: int):
    bot = message.bot
    if bot is None:
        return None
    file_path = getattr(file, "file_path", None)
    if not isinstance(file_path, str) or not file_path:
        await message.answer("Не удалось скачать файл. Попробуйте ещё раз.")
        return None
    destination = _LimitedDownload(max_bytes)
    try:
        downloaded = await bot.download_file(
            file_path, destination=destination
        )
    except _UploadTooLargeError:
        await _reject_oversized_upload(message, max_bytes + 1, max_bytes)
        return None
    if downloaded is None:
        await message.answer("Не удалось скачать файл. Попробуйте ещё раз.")
        return None
    payload = downloaded.read(max_bytes + 1)
    if not isinstance(payload, bytes):
        await message.answer("Не удалось прочитать файл. Попробуйте ещё раз.")
        return None
    if await _reject_oversized_upload(message, len(payload), max_bytes):
        return None
    return payload


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
    # Гейт по MINI_APP_URL: пустой/невалидный URL в WebAppInfo сломал бы
    # отправку самого сообщения, а не просто выглядел криво — поэтому
    # кнопка появляется только когда Mini App реально настроен
    # (HTTPS-домен, зарегистрированный в BotFather).
    if settings.MINI_APP_URL:
        rows.append(
            [
                InlineKeyboardButton(
                    text="Открыть приложение",
                    web_app=WebAppInfo(url=settings.MINI_APP_URL),
                )
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _is_plain_text(message: Message) -> bool:
    # Обычный вызываемый фильтр, а не цепочка magic-filter от aiogram —
    # избегает зависимости от того, как ведёт себя
    # `F.text.startswith(...)`, когда text равен None (нетекстовые
    # сообщения: фото, стикеры и т.д.).
    text = message.text
    return isinstance(text, str) and bool(text) and not text.startswith("/")


async def _telegram_user_for(message: Message):
    sender = await _telegram_sender_for(message)
    if sender is None:
        return None
    return await _telegram_user_from_sender(sender)


async def _telegram_sender_for(message: Message) -> TelegramUser | None:
    sender = message.from_user
    if sender is None:
        await message.answer("Не удалось определить ваш аккаунт Telegram.")
        return None
    return sender


async def _telegram_user_from_sender(sender: TelegramUser):
    return await sync_to_async(get_or_create_telegram_user)(
        sender.id, sender.username or ""
    )


async def _normalize_uploaded_image(
    message: Message, payload: bytes
) -> bytes | None:
    try:
        return normalize_generated_image(payload)
    except ValueError:
        await message.answer(
            "Некорректная картинка. Отправьте файл JPEG, PNG или WebP."
        )
        return None


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
    if not message.photo:
        return False
    data = await state.get_data()
    return bool(data.get("awaiting_photo_analysis"))


@router.message(CommandStart())
async def on_start(
    message: Message, state: FSMContext, command: CommandObject
) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, created = user_result
    if created and command.args:
        # Прикрепить реферала может только совершенно новый пользователь
        # — почему это делает "один бонус на аккаунт" структурным
        # свойством, а не отдельно проверяемым условием, см. докстринг
        # referrals/services.py record_referral.
        await sync_to_async(record_referral)(user, command.args)
    account = await sync_to_async(get_or_create_account)(user)
    await state.update_data(task=DEFAULT_TASK)
    greeting = "Добро пожаловать в Lumenza!" if created else "С возвращением!"

    if settings.MINI_APP_URL:
        # Mini App покрывает тот же функционал, что и текстовый пикер
        # ниже — держать оба как основной UI избыточно (два места, где
        # может сломаться одно и то же). Команды (/task, /image, /voice,
        # обычный текст) всё равно остаются рабочими без изменений —
        # это осознанный fallback для клиентов Telegram, которые хуже
        # открывают Web App (старые версии, некоторые десктопные).
        await message.answer(
            f"{greeting}\nБаланс: {account.balance} кредитов.\n\n"
            "Откройте приложение ниже для полного интерфейса. Предпочитаете "
            "команды? /task, /image и /voice тоже по-прежнему работают.",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="Открыть приложение",
                            web_app=WebAppInfo(url=settings.MINI_APP_URL),
                        )
                    ]
                ]
            ),
        )
        return

    unlocked = await sync_to_async(get_unlocked_keys)(user)
    await message.answer(
        f"{greeting}\nБаланс: {account.balance} кредитов.\n\n"
        "Отправьте сообщение для подписи, поста или идеи контента — или "
        "используйте /image <промпт> для визуала. Выберите задачу ниже:",
        reply_markup=_task_keyboard(DEFAULT_TASK, unlocked),
    )


@router.message(Command("invite"))
async def on_invite(message: Message) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    link = await sync_to_async(referral_link_for)(user)
    await message.answer(
        "Пригласите друзей — вы оба получите бонусные кредиты, как только "
        f"они попробуют Lumenza:\n{link}"
    )


@router.message(Command("balance"))
async def on_balance(message: Message) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    account = await sync_to_async(get_or_create_account)(user)
    await message.answer(f"Баланс: {account.balance} кредитов.")


@router.message(Command("task"))
async def on_task(message: Message, state: FSMContext) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    data = await state.get_data()
    current = data.get("task", DEFAULT_TASK)
    unlocked = await sync_to_async(get_unlocked_keys)(user)
    await message.answer(
        "Выберите задачу:", reply_markup=_task_keyboard(current, unlocked)
    )


@router.callback_query(
    lambda callback: (callback.data or "").startswith("task:")
)
async def on_task_selected(callback: CallbackQuery, state: FSMContext) -> None:
    callback_data = callback.data
    if not callback_data or not callback_data.startswith("task:"):
        await callback.answer("Неизвестная задача", show_alert=True)
        return
    task = callback_data.split(":", 1)[1]
    if task not in TASKS:
        await callback.answer("Неизвестная задача", show_alert=True)
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        callback.from_user.id, callback.from_user.username or ""
    )
    unlocked = await sync_to_async(get_unlocked_keys)(user)
    if task not in unlocked:
        await callback.answer("Ещё не разблокировано на вашем тарифе", show_alert=True)
        return

    await state.update_data(task=task)
    if callback.message is not None and not isinstance(
        callback.message, InaccessibleMessage
    ):
        await callback.message.edit_reply_markup(
            reply_markup=_task_keyboard(task, unlocked)
        )
    await callback.answer(f"Задача установлена: {task}")


@router.message(Command("image"))
async def on_image(message: Message, command: CommandObject) -> None:
    prompt = (command.args or "").strip()
    if not prompt:
        await message.answer(
            "Использование: /image описание нужного визуала"
        )
        return

    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    outcome = await sync_to_async(start_image_generation)(
        user, prompt, DEFAULT_IMAGE_TASK, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "Этот визуальный стиль ещё не разблокирован на вашем тарифе."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Недостаточно кредитов для этого запроса.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Генерация картинки временно недоступна — попробуйте "
            "чуть позже."
        )
    else:
        await message.answer(
            "Генерирую картинку — пришлю сюда, как только будет готово."
        )


@router.message(Command("subscribe"))
async def on_subscribe(message: Message) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    outcome = await sync_to_async(start_subscription)(
        user, Decimal(str(settings.PRO_SUBSCRIPTION_PRICE_RUB))
    )

    if outcome.status == "already_subscribed":
        await message.answer("Вы уже подписаны на Pro.")
    elif outcome.status == "unavailable":
        await message.answer("Подписки сейчас недоступны.")
    else:
        await message.answer(
            f"Завершите оформление подписки здесь:\n{outcome.confirmation_url}"
        )


@router.message(Command("unsubscribe"))
async def on_unsubscribe(message: Message) -> None:
    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    canceled = await sync_to_async(cancel_subscription)(user)
    if canceled:
        await message.answer("Ваша подписка Pro отменена.")
    else:
        await message.answer("У вас нет активной подписки.")


@router.message(F.voice)
async def on_voice(message: Message) -> None:
    voice = message.voice
    if voice is None:
        await message.answer("Отправьте голосовое сообщение.")
        return
    sender = await _telegram_sender_for(message)
    if sender is None:
        return
    file = await _get_verified_telegram_file(
        message,
        voice.file_id,
        voice.file_size,
        MAX_AUDIO_UPLOAD_BYTES,
    )
    if file is None:
        return

    audio_bytes = await _download_verified_upload(
        message, file, MAX_AUDIO_UPLOAD_BYTES
    )
    if audio_bytes is None:
        return
    user, _ = await _telegram_user_from_sender(sender)
    audio_file = ContentFile(audio_bytes, name="voice.ogg")

    outcome = await sync_to_async(start_transcription)(
        user, audio_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "Расшифровка голоса ещё не разблокирована на вашем тарифе."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Недостаточно кредитов для этого запроса.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Расшифровка временно недоступна — попробуйте "
            "чуть позже."
        )
    else:
        await message.answer(
            "Расшифровываю голосовое — пришлю текст сюда, "
            "как только будет готово."
        )


@router.message(Command("describe"))
async def on_describe_prompt(message: Message, state: FSMContext) -> None:
    await state.update_data(awaiting_photo_analysis=True)
    await message.answer(
        "Отправьте мне фото — напишу для него идею подписи."
    )


@router.message(_awaiting_photo_analysis)
async def on_photo_analysis(message: Message, state: FSMContext) -> None:
    await state.update_data(awaiting_photo_analysis=False)
    photos = message.photo
    if not photos:
        await message.answer("Отправьте фото для анализа.")
        return
    sender = await _telegram_sender_for(message)
    if sender is None:
        return
    photo = photos[-1]
    file = await _get_verified_telegram_file(
        message, photo.file_id, photo.file_size, MAX_IMAGE_UPLOAD_BYTES
    )
    if file is None:
        return

    image_bytes = await _download_verified_upload(
        message, file, MAX_IMAGE_UPLOAD_BYTES
    )
    if image_bytes is None:
        return
    image_bytes = await _normalize_uploaded_image(message, image_bytes)
    if image_bytes is None:
        return
    user, _ = await _telegram_user_from_sender(sender)
    image_file = ContentFile(image_bytes, name="photo.png")

    outcome = await sync_to_async(start_photo_analysis)(
        user, image_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer("Анализ фото ещё не разблокирован на вашем тарифе.")
    elif outcome.status == "insufficient_credits":
        await message.answer("Недостаточно кредитов для этого запроса.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Анализ фото временно недоступен — попробуйте "
            "чуть позже."
        )
    else:
        await message.answer(
            "Смотрю на ваше фото — пришлю идею подписи сюда, "
            "как только будет готово."
        )


@router.message(F.photo, F.caption)
async def on_photo_edit(message: Message) -> None:
    # Зарегистрирован перед обычным обработчиком document/photo ниже,
    # чтобы фото С подписью трактовалось как "отредактируй это фото,
    # используя подпись как промпт" — фото без подписи всё равно
    # проваливается дальше в OCR.
    caption = (message.caption or "").strip()
    if not caption:
        await message.answer("Добавьте подпись с описанием нужной правки.")
        return
    photos = message.photo
    if not photos:
        await message.answer("Отправьте фото для редактирования.")
        return
    sender = await _telegram_sender_for(message)
    if sender is None:
        return
    photo = photos[-1]
    file = await _get_verified_telegram_file(
        message, photo.file_id, photo.file_size, MAX_IMAGE_UPLOAD_BYTES
    )
    if file is None:
        return

    image_bytes = await _download_verified_upload(
        message, file, MAX_IMAGE_UPLOAD_BYTES
    )
    if image_bytes is None:
        return
    image_bytes = await _normalize_uploaded_image(message, image_bytes)
    if image_bytes is None:
        return
    user, _ = await _telegram_user_from_sender(sender)
    image_file = ContentFile(image_bytes, name="source.png")

    outcome = await sync_to_async(start_image_edit)(
        user,
        caption,
        image_file,
        telegram_chat_id=message.chat.id,
    )

    if outcome.status == "task_locked":
        await message.answer("Редактирование фото ещё не разблокировано на вашем тарифе.")
    elif outcome.status == "insufficient_credits":
        await message.answer("Недостаточно кредитов для этого запроса.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Редактирование фото временно недоступно — попробуйте "
            "чуть позже."
        )
    else:
        await message.answer(
            "Редактирую фото — пришлю результат сюда, как только "
            "будет готово."
        )


@router.message(F.document | F.photo)
async def on_document(message: Message) -> None:
    document = message.document
    photos = message.photo
    upload = document or (photos[-1] if photos else None)
    if upload is None:
        await message.answer("Загрузите картинку-документ или фото.")
        return
    sender = await _telegram_sender_for(message)
    if sender is None:
        return
    if document:
        mime_type = document.mime_type
        extension = Path(document.file_name or "").suffix.lower()
        supported_type = mime_type in SUPPORTED_DOCUMENT_MIME_TYPES or (
            not mime_type and extension in SUPPORTED_DOCUMENT_EXTENSIONS
        )
        if not supported_type:
            await message.answer(
                "Неподдерживаемый тип документа. Отправьте картинку JPEG, PNG или WebP."
            )
            return

    file = await _get_verified_telegram_file(
        message,
        upload.file_id,
        upload.file_size,
        MAX_DOCUMENT_UPLOAD_BYTES,
    )
    if file is None:
        return

    document_bytes = await _download_verified_upload(
        message, file, MAX_DOCUMENT_UPLOAD_BYTES
    )
    if document_bytes is None:
        return
    document_bytes = await _normalize_uploaded_image(message, document_bytes)
    if document_bytes is None:
        return
    user, _ = await _telegram_user_from_sender(sender)
    document_file = ContentFile(document_bytes, name="document.png")

    outcome = await sync_to_async(start_document_extraction)(
        user, document_file, telegram_chat_id=message.chat.id
    )

    if outcome.status == "task_locked":
        await message.answer(
            "Извлечение текста из документов ещё не разблокировано на вашем тарифе."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer("Недостаточно кредитов для этого запроса.")
    elif outcome.status == "enqueue_failed":
        await message.answer(
            "Извлечение временно недоступно — попробуйте чуть позже."
        )
    else:
        await message.answer(
            "Читаю ваш документ — пришлю извлечённый текст "
            "сюда, как только будет готово."
        )


@router.message(_is_plain_text)
async def on_text(message: Message, state: FSMContext) -> None:
    text = message.text
    if text is None:
        return
    prompt = text.strip()
    if not prompt:
        return

    user_result = await _telegram_user_for(message)
    if user_result is None:
        return
    user, _ = user_result
    data = await state.get_data()
    task = data.get("task", DEFAULT_TASK)

    outcome = await sync_to_async(run_chat)(user, prompt, task)

    if outcome.status == "task_locked":
        await message.answer(
            "Эта задача ещё не разблокирована на вашем тарифе. Отправьте "
            "/task, чтобы увидеть варианты."
        )
    elif outcome.status == "insufficient_credits":
        await message.answer(
            "Недостаточно кредитов для этого запроса. Пополните баланс "
            "в веб-приложении, чтобы продолжить."
        )
    elif outcome.status == "provider_error":
        await message.answer(
            "Все провайдеры для этой задачи не сработали. Списание не производилось."
        )
    elif outcome.status == "blocked":
        await message.answer(
            "Это сообщение заблокировано модерацией. Списание не производилось."
        )
    else:
        await message.answer(
            f"{outcome.text}\n\n— {outcome.provider}/{outcome.model} "
            f"({task}) · {outcome.credits_charged} кредитов · "
            f"баланс {outcome.balance}"
        )
