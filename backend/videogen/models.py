import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _upload_to(instance, filename):
    # Тот же принцип, что и у imagegen._upload_to: непредсказуемый
    # uuid-путь делает сам URL средством контроля доступа, пока в
    # продакшене его не заменит настоящее объектное хранилище /
    # подписанные URL.
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    return f"generated_videos/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class GeneratedVideo(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        OK = "ok", "OK"
        ERROR = "error", "Error"
        INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
        BLOCKED = "blocked", "Blocked by moderation"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generated_videos",
    )
    prompt = models.TextField(max_length=4000)
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    video = models.FileField(upload_to=_upload_to, blank=True, null=True)
    # Заполняется только для запросов image-to-video ("Starting frame") —
    # стартовый кадр, который пользователь предоставил. Null для обычной
    # генерации текст-в-видео.
    source_image = models.ImageField(
        upload_to=_upload_to, blank=True, null=True
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    # Пока status=pending здесь хранится зарезервированный холд кредитов;
    # как только задача Celery завершится, здесь будет финальное
    # (сверенное) списание.
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.provider}/{self.model} {self.status}"
