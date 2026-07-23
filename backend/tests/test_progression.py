from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import User as UserModel
from progression.models import (
    ModelUnlockable,
    UnlockableResource,
    UserModelUnlock,
    UserUnlock,
)
from progression.services import (
    ALL_KEYS,
    BASE_FREE_KEYS,
    check_and_unlock,
    get_model_progress,
    get_progress,
    get_unlocked_keys,
    get_unlocked_models,
)
from providers.models import RequestLog
from tests.helpers import make_user as _make_user

pytestmark = pytest.mark.django_db


def _log_success(user, days_ago=0):
    log = RequestLog.objects.create(
        user=user,
        provider="openai",
        model="gpt-4o-mini",
        task="repurpose",
        status=RequestLog.Status.OK,
    )
    if days_ago:
        RequestLog.objects.filter(pk=log.pk).update(
            created_at=timezone.now() - timedelta(days=days_ago)
        )
    return log


def test_free_user_starts_with_base_keys_unlocked():
    user = _make_user()
    assert get_unlocked_keys(user) == BASE_FREE_KEYS


def test_paid_user_has_everything_unlocked():
    user = _make_user(tier=UserModel.Tier.PAID)
    assert get_unlocked_keys(user) == ALL_KEYS


def test_all_keys_covers_every_chat_task_route():
    # ALL_KEYS — вручную поддерживаемый литерал (не живое чтение
    # providers.TASK_ROUTES), тот же класс риска рассинхронизации, что уже
    # защищён для ModelUnlockable в test_model_unlockable_catalog_matches_task_routes
    # ниже — реальный баг (PAID-пользователь получал task_locked на новую
    # категорию "search", потому что её забыли добавить сюда при добавлении
    # в TASK_ROUTES) обнаружен вживую, эта проверка — чтобы не повторилось.
    from providers.services import TASK_ROUTES

    assert set(TASK_ROUTES.keys()) <= ALL_KEYS


def test_check_and_unlock_unlocks_once_thresholds_met():
    user = _make_user()
    translation = UnlockableResource.objects.get(key="translation")
    assert translation.min_requests == 3
    assert translation.min_distinct_days == 1

    # min_distinct_days=1 тривиально выполняется любым единственным днём
    # использования, так что нужен только порог по числу запросов — 2
    # запросов пока недостаточно.
    for _ in range(2):
        _log_success(user)
    assert check_and_unlock(user) == []
    assert "translation" not in get_unlocked_keys(user)

    _log_success(user)
    newly_unlocked = check_and_unlock(user)

    assert "translation" in newly_unlocked
    assert "translation" in get_unlocked_keys(user)


def test_distinct_days_requirement_blocks_same_day_burst():
    user = _make_user()
    realistic = UnlockableResource.objects.get(key="realistic")
    assert realistic.min_requests == 6
    assert realistic.min_distinct_days == 2

    # 6 запросов, все сегодня, удовлетворяют счётчику, но не условию по
    # уникальным дням — это и есть работающий антифарм-механизм.
    for _ in range(6):
        _log_success(user)
    newly_unlocked = check_and_unlock(user)
    assert "realistic" not in newly_unlocked
    assert "realistic" not in get_unlocked_keys(user)
    # translation разблокируется в том же проходе — её собственные
    # пороги (3/1) выполнены.
    assert "translation" in newly_unlocked

    # Запрос со второго дня удовлетворяет и условию по уникальным дням
    # тоже.
    _log_success(user, days_ago=1)
    newly_unlocked_second = check_and_unlock(user)

    assert "realistic" in newly_unlocked_second
    assert "realistic" in get_unlocked_keys(user)


def test_check_and_unlock_is_idempotent():
    user = _make_user()
    for _ in range(3):
        _log_success(user)
    _log_success(user, days_ago=1)

    first = check_and_unlock(user)
    second = check_and_unlock(user)

    assert "translation" in first
    assert second == []
    assert (
        UserUnlock.objects.filter(
            user=user, resource__key="translation"
        ).count()
        == 1
    )


def test_check_and_unlock_is_noop_for_paid_user():
    user = _make_user(tier=UserModel.Tier.PAID)
    assert check_and_unlock(user) == []
    assert not UserUnlock.objects.filter(user=user).exists()


def test_progress_excludes_already_unlocked_resources():
    user = _make_user()
    for _ in range(3):
        _log_success(user)
    _log_success(user, days_ago=1)
    check_and_unlock(user)

    keys_in_progress = {p.key for p in get_progress(user)}
    assert "translation" not in keys_in_progress
    assert "realistic" in keys_in_progress


def test_progress_is_empty_for_paid_user():
    user = _make_user(tier=UserModel.Tier.PAID)
    assert get_progress(user) == []


# --- Разблокировка по модели (на ступень ниже разблокировки категории)
# ---


def test_get_unlocked_models_is_empty_for_a_locked_task():
    # "hook" отсутствует в BASE_FREE_KEYS — свежий FREE-пользователь ещё
    # не заработал саму категорию, так что ни одна модель внутри неё
    # тоже не может быть выбираемой.
    user = _make_user()
    assert get_unlocked_models(user, "hook") == frozenset()


def test_get_unlocked_models_returns_primary_for_a_base_free_task():
    # "repurpose" ЕСТЬ в BASE_FREE_KEYS — её кандидат на позиции 0
    # (min_requests=min_distinct_days=0) бесплатен в тот же момент, что
    # и категория, при нулевом требуемом использовании.
    user = _make_user()
    primary = (
        ModelUnlockable.objects.filter(task="repurpose")
        .order_by("sort_order")
        .first()
    )
    assert primary.min_requests == 0
    assert primary.min_distinct_days == 0
    assert get_unlocked_models(user, "repurpose") == frozenset(
        {(primary.provider, primary.model)}
    )


def test_get_unlocked_models_returns_everything_for_paid_user():
    user = _make_user(tier=UserModel.Tier.PAID)
    all_repurpose = frozenset(
        ModelUnlockable.objects.filter(task="repurpose").values_list(
            "provider", "model"
        )
    )
    assert get_unlocked_models(user, "repurpose") == all_repurpose
    assert len(all_repurpose) > 1


def test_check_and_unlock_progressively_unlocks_models_within_a_task():
    user = _make_user()
    second_candidate = ModelUnlockable.objects.filter(
        task="repurpose"
    ).order_by("sort_order")[1]
    assert second_candidate.min_requests > 0

    # Пока недостаточно использования.
    for _ in range(second_candidate.min_requests - 1):
        _log_success(user)
    check_and_unlock(user)
    assert (
        second_candidate.provider,
        second_candidate.model,
    ) not in get_unlocked_models(user, "repurpose")

    # Ещё один запрос, охватывающий достаточно уникальных дней,
    # пересекает оба порога.
    for day in range(second_candidate.min_distinct_days):
        _log_success(user, days_ago=day)
    newly_unlocked = check_and_unlock(user)

    label = f"repurpose:{second_candidate.provider}/{second_candidate.model}"
    assert label in newly_unlocked
    assert (
        second_candidate.provider,
        second_candidate.model,
    ) in get_unlocked_models(user, "repurpose")
    assert (
        UserModelUnlock.objects.filter(
            user=user, resource=second_candidate
        ).count()
        == 1
    )


def test_check_and_unlock_models_is_idempotent():
    user = _make_user()
    second_candidate = ModelUnlockable.objects.filter(
        task="repurpose"
    ).order_by("sort_order")[1]
    for _ in range(second_candidate.min_requests):
        _log_success(user)
    for day in range(second_candidate.min_distinct_days):
        _log_success(user, days_ago=day + 1)

    check_and_unlock(user)
    second_pass = check_and_unlock(user)

    assert second_pass == []
    assert (
        UserModelUnlock.objects.filter(
            user=user, resource=second_candidate
        ).count()
        == 1
    )


def test_get_model_progress_lists_every_candidate_locked_or_not():
    user = _make_user()
    progress_rows = get_model_progress(user, "repurpose")
    total_candidates = ModelUnlockable.objects.filter(task="repurpose").count()

    assert len(progress_rows) == total_candidates
    unlocked_rows = [row for row in progress_rows if row.unlocked]
    assert len(unlocked_rows) == 1  # only the free primary, fresh user


def test_get_model_progress_all_unlocked_for_paid_user():
    user = _make_user(tier=UserModel.Tier.PAID)
    progress_rows = get_model_progress(user, "repurpose")
    assert all(row.unlocked for row in progress_rows)


def test_model_unlockable_catalog_matches_task_routes():
    """ModelUnlockable — вручную поддерживаемый снимок providers.TASK_ROUTES
    (почему это не может быть живым чтением, см. докстринг ModelUnlockable в
    progression/models.py — providers уже импортирует progression.services).
    Это защищает от незаметного расхождения этих двух мест: кандидат из
    TASK_ROUTES без соответствующей строки здесь никогда не появится как
    разблокируемый, а устаревшая строка для кандидата, убранного из
    TASK_ROUTES, позволила бы пользователю "разблокировать" модель, которая
    больше никуда не маршрутизируется."""
    from providers.services import TASK_ROUTES

    routes_pairs = {
        (task, provider, model)
        for task, candidates in TASK_ROUTES.items()
        for provider, model in candidates
    }
    catalog_pairs = set(
        ModelUnlockable.objects.values_list("task", "provider", "model")
    )
    assert routes_pairs == catalog_pairs
