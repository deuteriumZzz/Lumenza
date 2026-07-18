from django.contrib.auth import get_user_model

User = get_user_model()


def get_or_create_telegram_user(telegram_id: int, telegram_username: str = ""):
    """Links a Telegram account to the same User/CreditAccount model the web
    app uses (accounts.User.telegram_id), so credits and history are shared
    across both surfaces per SPEC.md. First contact creates the User exactly
    like web registration does — the existing post_save signal grants the
    same signup bonus either way, no bot-specific billing path needed."""
    user, created = User.objects.get_or_create(
        telegram_id=telegram_id,
        defaults={"username": f"tg_{telegram_id}"},
    )
    if created:
        # Telegram users never set a password — mark it explicitly unusable
        # rather than leaving Django's default (an empty/random hasher
        # value that could, depending on backend, still validate).
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user, created
