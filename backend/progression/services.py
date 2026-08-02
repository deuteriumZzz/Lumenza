from dataclasses import dataclass
from typing import List

from accounts.models import User
from progression.models import ModelUnlockable
from providers.access import (
    MODEL_ACCESS_STANDARD,
    ModelAccessClass,
    get_model_access_class,
)

# Compatibility exports for existing API clients and historical migrations.
# There is no longer a smaller task set for the base plan.
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
        "code_execution",
        "video",
        "video_i2v",
        "upscale_2x",
        "upscale_4x",
        "upscale_2x_face",
        "upscale_4x_face",
    }
)
BASE_FREE_KEYS = ALL_KEYS


def get_unlocked_keys(user) -> frozenset:
    """Every task is available immediately on both plans."""
    return ALL_KEYS


def get_unlocked_models(user, task: str) -> frozenset:
    candidates = ModelUnlockable.objects.filter(task=task).values_list(
        "provider", "model"
    )
    if user.tier == User.Tier.PAID:
        return frozenset(candidates)
    return frozenset(
        (provider, model)
        for provider, model in candidates
        if get_model_access_class(provider, model) == MODEL_ACCESS_STANDARD
    )


@dataclass
class ResourceProgress:
    key: str
    unlocked: bool
    current_requests: int
    target_requests: int
    current_days: int
    target_days: int


def get_progress(user) -> List[ResourceProgress]:
    """Legacy endpoint shape; progression has been retired."""
    return []


def check_and_unlock(user) -> List[str]:
    """Compatibility no-op preserving historical unlock rows."""
    return []


@dataclass
class ModelProgress:
    task: str
    provider: str
    model: str
    unlocked: bool
    access_class: ModelAccessClass
    current_requests: int = 0
    target_requests: int = 0
    current_days: int = 0
    target_days: int = 0


def _model_progress(user, resource: ModelUnlockable) -> ModelProgress:
    access_class = get_model_access_class(resource.provider, resource.model)
    return ModelProgress(
        task=resource.task,
        provider=resource.provider,
        model=resource.model,
        unlocked=(
            user.tier == User.Tier.PAID
            or access_class == MODEL_ACCESS_STANDARD
        ),
        access_class=access_class,
    )


def get_model_progress(user, task: str) -> List[ModelProgress]:
    return [
        _model_progress(user, resource)
        for resource in ModelUnlockable.objects.filter(task=task)
    ]


def get_models_catalog(user) -> List[ModelProgress]:
    return [
        _model_progress(user, resource)
        for resource in ModelUnlockable.objects.order_by("task", "sort_order")
    ]
