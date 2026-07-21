from django.conf import settings
from django.db import models


class UnlockableResource(models.Model):
    """Каталог категорий задач, с которыми FREE-пользователь не начинает —
    логику разблокировки с общим счётчиком см. в progression/services.py.
    PAID-пользователи полностью обходят этот каталог (см. get_unlocked_keys).
    """

    class Kind(models.TextChoices):
        TEXT_TASK = "text_task", "Text task"
        IMAGE_TASK = "image_task", "Image task"
        MEDIA_TASK = "media_task", "Media task (voice/OCR)"

    key = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    min_requests = models.PositiveIntegerField()
    min_distinct_days = models.PositiveIntegerField()
    sort_order = models.PositiveIntegerField()

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return (
            f"{self.key} ({self.min_requests} reqs / "
            f"{self.min_distinct_days} days)"
        )


class UserUnlock(models.Model):
    """Неизменяемая запись о том, когда FREE-пользователь пересёк порог
    ресурса — никогда не отзывается, повторяет стиль журнала только для
    добавления billing.LedgerEntry."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="unlocks",
    )
    resource = models.ForeignKey(UnlockableResource, on_delete=models.CASCADE)
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "resource")
        ordering = ["-unlocked_at"]

    def __str__(self):
        return f"{self.user} unlocked {self.resource.key}"


class ModelUnlockable(models.Model):
    """Каталог разблокировок по модели, вложен на ступень ниже
    UnlockableResource — например, категория "hook" разблокируется первой
    (UnlockableResource), а затем каждая отдельная модель-кандидат внутри
    TASK_ROUTES["hook"] разблокируется по своему собственному расписанию
    через эту таблицу. PRIMARY-вариант категории (индекс 0 в TASK_ROUTES)
    всегда имеет min_requests=min_distinct_days=0, то есть бесплатен в тот
    же момент, когда разблокирована сама категория — повторяет паттерн
    BASE_FREE_KEYS "самому дешёвому кандидату не нужна отдельная
    разблокировка" на ступень ниже.

    Эта таблица — вручную поддерживаемый снимок providers.TASK_ROUTES, а не
    его живое чтение (progression не может импортировать providers —
    providers уже импортирует progression.services, и models.py в любом
    случае никогда не должен импортировать приложение, не установленное
    раньше него в INSTALLED_APPS). Синхронизировать эти два места вручную:
    добавление кандидата в TASK_ROUTES требует соответствующей миграции
    здесь, иначе этот кандидат никогда не появится доступным для выбора."""

    task = models.CharField(max_length=32)
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    min_requests = models.PositiveIntegerField()
    min_distinct_days = models.PositiveIntegerField()
    sort_order = models.PositiveIntegerField()

    class Meta:
        unique_together = ("task", "provider", "model")
        ordering = ["task", "sort_order"]

    def __str__(self):
        return (
            f"{self.task}:{self.provider}/{self.model} "
            f"({self.min_requests} reqs / {self.min_distinct_days} days)"
        )


class UserModelUnlock(models.Model):
    """Та же append-only форма, что и у UserUnlock, на ступень ниже."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="model_unlocks",
    )
    resource = models.ForeignKey(ModelUnlockable, on_delete=models.CASCADE)
    unlocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "resource")
        ordering = ["-unlocked_at"]

    def __str__(self):
        r = self.resource
        return f"{self.user} unlocked {r.task}:{r.provider}/{r.model}"
