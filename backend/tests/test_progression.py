import pytest

from accounts.models import User as UserModel
from progression.models import ModelUnlockable, UserModelUnlock, UserUnlock
from progression.services import (
    ALL_KEYS,
    check_and_unlock,
    get_model_progress,
    get_models_catalog,
    get_progress,
    get_unlocked_keys,
    get_unlocked_models,
)
from providers.access import (
    MODEL_ACCESS_PREMIUM,
    MODEL_ACCESS_STANDARD,
    get_model_access_class,
)
from providers.services import TASK_ROUTES
from tests.helpers import make_user as _make_user

pytestmark = pytest.mark.django_db


def test_every_task_is_available_to_base_and_paid_users():
    free_user = _make_user()
    paid_user = _make_user(username="paid", tier=UserModel.Tier.PAID)

    assert get_unlocked_keys(free_user) == ALL_KEYS
    assert get_unlocked_keys(paid_user) == ALL_KEYS


def test_all_keys_covers_every_chat_task_route():
    assert set(TASK_ROUTES) <= ALL_KEYS


def test_progression_is_retired_without_deleting_historical_data():
    user = _make_user()

    assert get_progress(user) == []
    assert check_and_unlock(user) == []
    assert not UserUnlock.objects.filter(user=user).exists()
    assert not UserModelUnlock.objects.filter(user=user).exists()


def test_every_chat_task_has_a_standard_route_for_base_users():
    for task, routes in TASK_ROUTES.items():
        assert any(
            get_model_access_class(provider, model) == MODEL_ACCESS_STANDARD
            for provider, model in routes
        ), task


def test_unreviewed_model_defaults_to_premium():
    assert (
        get_model_access_class("new-provider", "unreviewed-model")
        == MODEL_ACCESS_PREMIUM
    )


def test_base_user_gets_standard_models_but_not_premium_models():
    user = _make_user()
    routes = TASK_ROUTES["repurpose"]
    expected = frozenset(
        (provider, model)
        for provider, model in routes
        if get_model_access_class(provider, model) == MODEL_ACCESS_STANDARD
    )

    assert get_unlocked_models(user, "repurpose") == expected
    assert expected
    assert any(
        get_model_access_class(provider, model) == MODEL_ACCESS_PREMIUM
        for provider, model in routes
    )


def test_paid_user_gets_every_model():
    user = _make_user(tier=UserModel.Tier.PAID)
    expected = frozenset(TASK_ROUTES["repurpose"])

    assert get_unlocked_models(user, "repurpose") == expected


def test_model_progress_is_an_entitlement_catalog_not_usage_progress():
    user = _make_user()
    rows = get_model_progress(user, "repurpose")

    assert len(rows) == len(TASK_ROUTES["repurpose"])
    assert {row.access_class for row in rows} == {
        MODEL_ACCESS_STANDARD,
        MODEL_ACCESS_PREMIUM,
    }
    assert all(
        row.unlocked == (row.access_class == MODEL_ACCESS_STANDARD)
        for row in rows
    )
    assert all(
        (
            row.current_requests,
            row.target_requests,
            row.current_days,
            row.target_days,
        )
        == (0, 0, 0, 0)
        for row in rows
    )


def test_paid_catalog_unlocks_standard_and_premium_models():
    user = _make_user(tier=UserModel.Tier.PAID)
    rows = get_models_catalog(user)

    assert rows
    assert all(row.unlocked for row in rows)
    assert {row.access_class for row in rows} == {
        MODEL_ACCESS_STANDARD,
        MODEL_ACCESS_PREMIUM,
    }


def test_models_catalog_preserves_seeded_route_order():
    user = _make_user(tier=UserModel.Tier.PAID)
    catalog = get_models_catalog(user)

    expected = list(
        ModelUnlockable.objects.order_by("task", "sort_order").values_list(
            "task", "provider", "model"
        )
    )
    actual = [(row.task, row.provider, row.model) for row in catalog]
    assert actual == expected


def test_model_unlockable_catalog_matches_task_routes():
    routes_pairs = {
        (task, provider, model)
        for task, candidates in TASK_ROUTES.items()
        for provider, model in candidates
    }
    catalog_pairs = set(
        ModelUnlockable.objects.values_list("task", "provider", "model")
    )

    assert routes_pairs == catalog_pairs


def test_model_ids_are_unique_within_each_task_route():
    for task, candidates in TASK_ROUTES.items():
        model_ids = [model for _, model in candidates]
        assert len(model_ids) == len(set(model_ids)), task
