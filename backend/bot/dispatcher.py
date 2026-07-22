from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import MenuButtonDefault, MenuButtonWebApp, WebAppInfo
from django.conf import settings

from bot.handlers import router


def create_bot() -> Bot:
    return Bot(token=settings.TELEGRAM_BOT_TOKEN)


async def configure_menu_button(bot: Bot) -> None:
    """Bot API помнит menu button на стороне Telegram по токену бота, а не
    по процессу — это одноразовая настройка, а не то, что нужно повторять
    на каждый холодный старт вебхука. Вызывается из run_bot_polling
    (удобно в dev, раз уж процесс уже стартует) и из отдельной ручной
    команды для прод-деплоя на вебхуке."""
    if settings.MINI_APP_URL:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Открыть приложение", web_app=WebAppInfo(url=settings.MINI_APP_URL)
            )
        )
    else:
        await bot.set_chat_menu_button(menu_button=MenuButtonDefault())


def create_dispatcher() -> Dispatcher:
    # MemoryStorage: выбор задачи сбрасывается при перезапуске/между
    # воркерами. Для MVP нормально (откатывается обратно к "repurpose");
    # FSM-хранилище на Redis было бы прод-апгрейдом, когда бот будет
    # работать более чем в одном процессе.
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    return dispatcher
