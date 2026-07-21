import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _upload_to_audio_in(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"
    return f"voice_in/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


def _upload_to_audio_out(instance, filename):
    return f"voice_out/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.mp3"


def _upload_to_document(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    return f"documents/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


def _upload_to_photo(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    return f"photos/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class MediaStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PROCESSING = "processing", "Processing"
    OK = "ok", "OK"
    ERROR = "error", "Error"
    INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
    TASK_LOCKED = "task_locked", "Task locked (free tier)"
    BLOCKED = "blocked", "Blocked by moderation"


class Transcription(models.Model):
    """Голос в текст: пользователь загружает аудио, получает текстовую
    транскрипцию. Цена — временная фиксированная за запрос (см.
    media_ops/pricing.py), пока не за минуту — для вычисления реальной
    длительности аудио понадобится зависимость для разбора аудио, которая
    больше нигде в проекте не используется."""

    Status = MediaStatus

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transcriptions",
    )
    audio = models.FileField(upload_to=_upload_to_audio_in)
    text = models.TextField(blank=True, default="")
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} transcription {self.status}"


class SpeechClip(models.Model):
    """Текст в голос (TTS): пользователь отправляет текст, получает
    сгенерированное аудио."""

    Status = MediaStatus

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="speech_clips",
    )
    text = models.TextField(max_length=4000)
    audio = models.FileField(
        upload_to=_upload_to_audio_out, blank=True, null=True
    )
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} speech clip {self.status}"


class DocumentExtraction(models.Model):
    """OCR: пользователь загружает изображение/PDF, получает извлечённый
    текст."""

    Status = MediaStatus

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="document_extractions",
    )
    document = models.FileField(upload_to=_upload_to_document)
    text = models.TextField(blank=True, default="")
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} document extraction {self.status}"


class PhotoAnalysis(models.Model):
    """Фото в подпись: пользователь загружает фото, получает описание/идею
    для подписи к контенту — отличается от DocumentExtraction (OCR,
    буквальный текст, видимый на изображении) и от GeneratedImage (создаёт
    новое изображение, а не описывает существующее)."""

    Status = MediaStatus

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="photo_analyses",
    )
    image = models.ImageField(upload_to=_upload_to_photo)
    text = models.TextField(blank=True, default="")
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} photo analysis {self.status}"
