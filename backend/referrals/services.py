from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from billing.models import LedgerEntry
from billing.services import grant_credits
from referrals.models import Referral

CODE_PREFIX = "ref_"


def referral_code_for(user) -> str:
    return f"{CODE_PREFIX}{user.id}"


def referral_link_for(user) -> str:
    code = referral_code_for(user)
    return f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={code}"


def _referrer_id_from_code(code: str):
    if not code or not code.startswith(CODE_PREFIX):
        return None
    raw = code[len(CODE_PREFIX) :]
    return int(raw) if raw.isdigit() else None


def record_referral(referred_user, code: str) -> bool:
    """Вызывается ровно один раз, сразу после создания совершенно нового
    пользователя (deep-ссылка /start бота или поле referral_code веб-
    регистрации) — см. bot/handlers.py on_start и accounts/views.py
    register. Вернувшийся пользователь, повторно отправивший ref-ссылку,
    никогда сюда не попадает (обе точки вызова проверяют собственный флаг
    "только что создан"), так что реферала нельзя прикрепить задним числом,
    а поскольку Referral.referred — это OneToOneField, повторная попытка
    для того же пользователя в любом случае провалится на уровне БД.

    Возвращает False (ничего не делает) для: некорректного/отсутствующего
    кода, самореферала, или несуществующего id пригласившего — никогда не
    выбрасывает исключение, поскольку неверный реферальный код — это
    пользовательский ввод, а не ошибка сервера."""
    referrer_id = _referrer_id_from_code(code)
    if referrer_id is None or referrer_id == referred_user.id:
        return False
    try:
        referrer = User.objects.get(id=referrer_id)
    except User.DoesNotExist:
        return False

    Referral.objects.create(referrer=referrer, referred=referred_user)
    return True


def check_referral_reward(user) -> None:
    """Вызывается после каждого успешного завершения чата/изображения/медиа
    (см. providers/services.py run_chat, imagegen/tasks.py _succeed, три
    пути завершения в media_ops/tasks.py) — та же схема подключения, что и у
    progression.services.check_and_unlock. Ничего не делает, если у `user`
    нет всё ещё PENDING-реферала: атомарный filter().update() ниже — это
    compare-and-swap (PENDING -> REWARDED), выиграть который может только
    один из конкурирующих вызовов, и как только он переключается, каждая
    последующая успешная генерация этого же пользователя не находит ничего
    в статусе PENDING и ничего не делает — это в точности "награда только
    после первой настоящей, платной генерации" без необходимости в
    отдельном счётчике первого успеха.
    """
    with transaction.atomic():
        updated = Referral.objects.filter(
            referred=user, status=Referral.Status.PENDING
        ).update(status=Referral.Status.REWARDED, rewarded_at=timezone.now())
        if not updated:
            return
        referral = Referral.objects.select_related("referrer").get(
            referred=user
        )

    reward = Decimal(str(settings.REFERRAL_REWARD_CREDITS))
    grant_credits(
        referral.referrer, reward, reason=LedgerEntry.Reason.REFERRAL_BONUS
    )
    grant_credits(user, reward, reason=LedgerEntry.Reason.REFERRAL_BONUS)
