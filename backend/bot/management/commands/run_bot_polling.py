import asyncio

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from bot.dispatcher import create_bot, create_dispatcher


class Command(BaseCommand):
    help = (
        "Run the Telegram bot in long-polling mode. Local/dev convenience — "
        "production should use the webhook endpoint (bot/views.py) instead, "
        "which is what TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL are for."
    )

    def handle(self, *args, **options):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError(
                "TELEGRAM_BOT_TOKEN is not set — get one from "
                "@BotFather and add it to .env"
            )

        bot = create_bot()
        dispatcher = create_dispatcher()
        self.stdout.write(
            self.style.SUCCESS("Starting Telegram bot (long polling)…")
        )
        asyncio.run(dispatcher.start_polling(bot))
