from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from django.conf import settings

from bot.handlers import router


def create_bot() -> Bot:
    return Bot(token=settings.TELEGRAM_BOT_TOKEN)


def create_dispatcher() -> Dispatcher:
    # MemoryStorage: выбор задачи сбрасывается при перезапуске/между
    # воркерами. Для MVP нормально (откатывается обратно к "repurpose");
    # FSM-хранилище на Redis было бы прод-апгрейдом, когда бот будет
    # работать более чем в одном процессе.
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    return dispatcher
