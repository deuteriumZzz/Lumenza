from django.contrib.auth import get_user_model

User = get_user_model()


def get_or_create_telegram_user(telegram_id: int, telegram_username: str = ""):
    """Связывает Telegram-аккаунт с той же моделью User/CreditAccount, что
    использует веб-приложение (accounts.User.telegram_id), так что кредиты
    и история общие на обеих поверхностях, как описано в SPEC.md. Первый
    контакт создаёт User точно так же, как это делает веб-регистрация —
    существующий сигнал post_save начисляет тот же приветственный бонус в
    любом случае, отдельный путь биллинга для бота не нужен."""
    user, created = User.objects.get_or_create(
        telegram_id=telegram_id,
        defaults={"username": f"tg_{telegram_id}"},
    )
    if created:
        # Пользователи Telegram никогда не задают пароль — явно помечаем
        # его как непригодный для использования, вместо того чтобы
        # оставлять дефолт Django (пустое/случайное значение хэшера,
        # которое в зависимости от бэкенда всё же могло бы пройти
        # валидацию).
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user, created
