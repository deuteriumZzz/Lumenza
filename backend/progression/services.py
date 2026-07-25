from dataclasses import dataclass
from typing import List

from django.db.models.functions import TruncDate

from accounts.models import User
from imagegen.models import GeneratedImage
from progression.models import (
    ModelUnlockable,
    UnlockableResource,
    UserModelUnlock,
    UserUnlock,
)
from providers.models import RequestLog

# Разблокировано для каждого FREE-пользователя с первого дня — самый
# дешёвый кандидат в каждой модальности (см. цены в
# providers.TASK_ROUTES / imagegen.IMAGE_TASK_ROUTES). Намеренно не
# строки в UnlockableResource: нечего разблокировать, значит нечего и
# отслеживать в прогрессе.
BASE_FREE_KEYS = frozenset({"hashtags", "repurpose", "illustration"})

ALL_KEYS = frozenset(
    {
        "hook",
        "longform",
        "hashtags",
        "content_plan",
        "repurpose",
        "translation",
        "search",
        "realistic",
        "illustration",
        "premium",
        "edit",
        "voice_to_text",
        "text_to_voice",
        "document_to_text",
        "photo_to_caption",
    }
)


def _usage_stats(user) -> tuple[int, int]:
    """(число_успешных_запросов, число_уникальных_активных_дней) по чату +
    генерации изображений — единый общий счётчик управляет разблокировкой
    каждой категории, а не квесты по отдельной категории (см. обсуждение
    прогрессии)."""
    text_ok = RequestLog.objects.filter(user=user, status=RequestLog.Status.OK)
    image_ok = GeneratedImage.objects.filter(
        user=user, status=GeneratedImage.Status.OK
    )

    count = text_ok.count() + image_ok.count()

    days = set(
        text_ok.annotate(day=TruncDate("created_at")).values_list(
            "day", flat=True
        )
    )
    days |= set(
        image_ok.annotate(day=TruncDate("completed_at")).values_list(
            "day", flat=True
        )
    )

    return count, len(days)


def get_unlocked_keys(user) -> frozenset:
    if user.tier == User.Tier.PAID:
        return ALL_KEYS
    unlocked = set(BASE_FREE_KEYS)
    unlocked |= set(
        UserUnlock.objects.filter(user=user).values_list(
            "resource__key", flat=True
        )
    )
    return frozenset(unlocked)


def get_unlocked_models(user, task: str) -> frozenset:
    """Пары (provider, model), которые пользователь может явно выбрать
    внутри `task` — на ступень ниже get_unlocked_keys, которая только
    открывает шлюз категории. Пусто, если сама категория ещё не
    разблокирована. Та же форма "статичный бесплатный набор ∪ набор
    выданных разблокировок", что и у get_unlocked_keys выше (не живой
    пересчёт из статистики использования) — кандидат на позиции 0
    (min_requests = min_distinct_days = 0) бесплатен в тот же момент, что и
    категория, точно так же, как BASE_FREE_KEYS работает для самих
    категорий."""
    if task not in get_unlocked_keys(user):
        return frozenset()
    if user.tier == User.Tier.PAID:
        return frozenset(
            ModelUnlockable.objects.filter(task=task).values_list(
                "provider", "model"
            )
        )

    unlocked = set(
        ModelUnlockable.objects.filter(
            task=task, min_requests=0, min_distinct_days=0
        ).values_list("provider", "model")
    )
    unlocked |= set(
        UserModelUnlock.objects.filter(
            user=user, resource__task=task
        ).values_list("resource__provider", "resource__model")
    )
    return frozenset(unlocked)


@dataclass
class ResourceProgress:
    key: str
    unlocked: bool
    current_requests: int
    target_requests: int
    current_days: int
    target_days: int


def get_progress(user) -> List[ResourceProgress]:
    if user.tier == User.Tier.PAID:
        return []

    count, days = _usage_stats(user)
    unlocked_keys = get_unlocked_keys(user)

    progress = []
    for resource in UnlockableResource.objects.order_by("sort_order"):
        if resource.key in unlocked_keys:
            continue
        progress.append(
            ResourceProgress(
                key=resource.key,
                unlocked=False,
                current_requests=min(count, resource.min_requests),
                target_requests=resource.min_requests,
                current_days=min(days, resource.min_distinct_days),
                target_days=resource.min_distinct_days,
            )
        )
    return progress


def check_and_unlock(user) -> List[str]:
    """Вызывается после успешного ответа чата или генерации изображения.
    Идемпотентна: полагается на unique_together у UnlockableResource +
    UserUnlock, так что повторный вызов для пользователя, у которого уже
    всё разблокировано, — no-op. Также проверяет ModelUnlockable в том же
    проходе — одна точка вызова обрабатывает оба уровня разблокировки,
    вместо того чтобы заставлять каждого вызывающего вызывать две функции."""
    if user.tier == User.Tier.PAID:
        return []

    count, days = _usage_stats(user)
    unlocked_keys = get_unlocked_keys(user)

    newly_unlocked = []
    for resource in UnlockableResource.objects.order_by("sort_order"):
        if resource.key in unlocked_keys:
            continue
        if (
            count >= resource.min_requests
            and days >= resource.min_distinct_days
        ):
            _, created = UserUnlock.objects.get_or_create(
                user=user, resource=resource
            )
            if created:
                newly_unlocked.append(resource.key)

    already_unlocked_model_ids = set(
        UserModelUnlock.objects.filter(user=user).values_list(
            "resource_id", flat=True
        )
    )
    for model_resource in ModelUnlockable.objects.exclude(
        min_requests=0, min_distinct_days=0
    ):
        if model_resource.id in already_unlocked_model_ids:
            continue
        if (
            count >= model_resource.min_requests
            and days >= model_resource.min_distinct_days
        ):
            _, created = UserModelUnlock.objects.get_or_create(
                user=user, resource=model_resource
            )
            if created:
                newly_unlocked.append(
                    f"{model_resource.task}:"
                    f"{model_resource.provider}/{model_resource.model}"
                )
    return newly_unlocked


@dataclass
class ModelProgress:
    task: str
    provider: str
    model: str
    unlocked: bool
    current_requests: int
    target_requests: int
    current_days: int
    target_days: int


def get_model_progress(user, task: str) -> List[ModelProgress]:
    """Каждый кандидат для `task`, разблокирован он или нет — пикер
    показывает полный упорядоченный список с заблокированными позициями,
    отображёнными серым, и их прогрессом, а не только то, что уже
    разблокировано."""
    if user.tier == User.Tier.PAID:
        return [
            ModelProgress(
                task=task,
                provider=r.provider,
                model=r.model,
                unlocked=True,
                current_requests=0,
                target_requests=0,
                current_days=0,
                target_days=0,
            )
            for r in ModelUnlockable.objects.filter(task=task)
        ]

    count, days = _usage_stats(user)
    unlocked_models = get_unlocked_models(user, task)
    progress = []
    for resource in ModelUnlockable.objects.filter(task=task):
        progress.append(
            ModelProgress(
                task=task,
                provider=resource.provider,
                model=resource.model,
                unlocked=(resource.provider, resource.model)
                in unlocked_models,
                current_requests=min(count, resource.min_requests),
                target_requests=resource.min_requests,
                current_days=min(days, resource.min_distinct_days),
                target_days=resource.min_distinct_days,
            )
        )
    return progress


def get_models_catalog(user) -> List[ModelProgress]:
    """Полный упорядоченный каталог моделей для единого селектора чата.

    Каждая строка сохраняет task: явный выбор модели всегда отправляется
    вместе с совместимой категорией и не может разойтись с авто-классификацией.
    """
    resources = list(ModelUnlockable.objects.order_by("task", "sort_order"))
    if user.tier == User.Tier.PAID:
        return [
            ModelProgress(
                task=resource.task,
                provider=resource.provider,
                model=resource.model,
                unlocked=True,
                current_requests=0,
                target_requests=0,
                current_days=0,
                target_days=0,
            )
            for resource in resources
        ]

    count, days = _usage_stats(user)
    unlocked_tasks = get_unlocked_keys(user)
    explicitly_unlocked_ids = set(
        UserModelUnlock.objects.filter(user=user).values_list(
            "resource_id", flat=True
        )
    )
    return [
        ModelProgress(
            task=resource.task,
            provider=resource.provider,
            model=resource.model,
            unlocked=(
                resource.task in unlocked_tasks
                and (
                    (
                        resource.min_requests == 0
                        and resource.min_distinct_days == 0
                    )
                    or resource.id in explicitly_unlocked_ids
                )
            ),
            current_requests=min(count, resource.min_requests),
            target_requests=resource.min_requests,
            current_days=min(days, resource.min_distinct_days),
            target_days=resource.min_distinct_days,
        )
        for resource in resources
    ]
