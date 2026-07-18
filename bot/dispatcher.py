from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from django.conf import settings

from bot.handlers import router


def create_bot() -> Bot:
    return Bot(token=settings.TELEGRAM_BOT_TOKEN)


def create_dispatcher() -> Dispatcher:
    # MemoryStorage: mode selection resets on restart/across workers. Fine
    # for MVP (defaults back to "fast"); a Redis-backed FSM storage would
    # be the production upgrade once the bot runs with >1 process.
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    return dispatcher
