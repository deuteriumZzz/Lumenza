from aiogram import Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from asgiref.sync import sync_to_async

from billing.services import get_or_create_account
from bot.services import get_or_create_telegram_user
from imagegen.services import start_image_generation
from providers.services import MODE_ROUTES, run_chat

router = Router(name="lumenza")

MODES = list(MODE_ROUTES.keys())
DEFAULT_MODE = "fast"
# Bot commands generate images via the OpenAI route only — the web UI is
# where a user picks between providers deliberately; /image is a quick
# single default rather than exposing the same provider choice here too.
DEFAULT_IMAGE_PROVIDER = "openai"


def _mode_keyboard(current: str) -> InlineKeyboardMarkup:
    buttons = [
        InlineKeyboardButton(
            text=("✓ " if mode == current else "") + mode,
            callback_data=f"mode:{mode}",
        )
        for mode in MODES
    ]
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


def _is_plain_text(message: Message) -> bool:
    # A plain callable filter, not aiogram's magic-filter chaining — avoids
    # relying on how `F.text.startswith(...)` behaves when text is None
    # (non-text messages: photos, stickers, etc.).
    return bool(message.text) and not message.text.startswith("/")


@router.message(CommandStart())
async def on_start(message: Message, state: FSMContext) -> None:
    user, created = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    account = await sync_to_async(get_or_create_account)(user)
    await state.update_data(mode=DEFAULT_MODE)
    greeting = "Welcome to Lumenza!" if created else "Welcome back!"
    await message.answer(
        f"{greeting}\nBalance: {account.balance} credits.\n\n"
        "Send any message to chat, or use /image <prompt> to generate an "
        "image. Pick a mode below:",
        reply_markup=_mode_keyboard(DEFAULT_MODE),
    )


@router.message(Command("balance"))
async def on_balance(message: Message) -> None:
    user, _ = await sync_to_async(get_or_create_telegram_user)(message.from_user.id)
    account = await sync_to_async(get_or_create_account)(user)
    await message.answer(f"Balance: {account.balance} credits.")


@router.message(Command("mode"))
async def on_mode(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    current = data.get("mode", DEFAULT_MODE)
    await message.answer("Pick a mode:", reply_markup=_mode_keyboard(current))


@router.callback_query(lambda callback: (callback.data or "").startswith("mode:"))
async def on_mode_selected(callback: CallbackQuery, state: FSMContext) -> None:
    mode = callback.data.split(":", 1)[1]
    if mode not in MODES:
        await callback.answer("Unknown mode", show_alert=True)
        return
    await state.update_data(mode=mode)
    if callback.message is not None:
        await callback.message.edit_reply_markup(reply_markup=_mode_keyboard(mode))
    await callback.answer(f"Mode set to {mode}")


@router.message(Command("image"))
async def on_image(message: Message, command: CommandObject) -> None:
    prompt = (command.args or "").strip()
    if not prompt:
        await message.answer("Usage: /image a description of what to generate")
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    outcome = await sync_to_async(start_image_generation)(
        user, prompt, DEFAULT_IMAGE_PROVIDER, telegram_chat_id=message.chat.id
    )

    if outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request.")
    elif outcome.status == "enqueue_failed":
        await message.answer("Image generation is temporarily unavailable — please try again shortly.")
    else:
        await message.answer("Generating your image — I'll send it here when it's ready.")


@router.message(_is_plain_text)
async def on_text(message: Message, state: FSMContext) -> None:
    prompt = message.text.strip()
    if not prompt:
        return

    user, _ = await sync_to_async(get_or_create_telegram_user)(
        message.from_user.id, message.from_user.username or ""
    )
    data = await state.get_data()
    mode = data.get("mode", DEFAULT_MODE)

    outcome = await sync_to_async(run_chat)(user, prompt, mode)

    if outcome.status == "insufficient_credits":
        await message.answer("Not enough credits for this request. Top up in the web app to continue.")
    elif outcome.status == "provider_error":
        await message.answer("Every provider for this mode failed. Nothing was charged.")
    else:
        await message.answer(
            f"{outcome.text}\n\n— {outcome.provider}/{outcome.model} "
            f"({mode}) · {outcome.credits_charged} credits · balance {outcome.balance}"
        )
