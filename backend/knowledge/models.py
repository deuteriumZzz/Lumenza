import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from media_ops.models import MediaStatus


def _upload_to_knowledge_image(instance, filename):
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    return f"knowledge/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class Workspace(models.Model):
    """Личная коллекция источников знаний. Пока без командных/shared
    workspace — в проекте нет модели организации/команды вообще, поэтому
    "командные источники" из SPEC.md Phase 17 сознательно не входят в v1."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspaces",
    )
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user} workspace {self.name!r}"


class Source(models.Model):
    """Один загруженный источник (вставленный текст или изображение с
    OCR) внутри Workspace. Прямое поле `user` (не только через
    workspace.user) — намеренное дублирование: billing.services'
    claim_pending_record/refund_hold написаны для моделей с прямым FK
    `user` (`.select_related("user")` не работает со свойством), тот же
    контракт, что у Transcription/SpeechClip/DocumentExtraction/
    PhotoAnalysis в media_ops. Ownership-проверки во view всё равно всегда
    идут через `workspace`, чтобы гарантия жила на уровне родителя."""

    class Kind(models.TextChoices):
        TEXT = "text", "Text"
        IMAGE = "image", "Image"

    Status = MediaStatus

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="sources"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_sources",
    )
    kind = models.CharField(max_length=8, choices=Kind.choices)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    # Для kind=TEXT — исходный вставленный текст; для kind=IMAGE —
    # заполняется результатом OCR при обработке (изначально пусто).
    raw_text = models.TextField(blank=True, default="")
    image = models.ImageField(
        upload_to=_upload_to_knowledge_image, blank=True, null=True
    )
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
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
        return f"{self.workspace_id} source {self.status}"


def _generate_public_key() -> str:
    import secrets

    return secrets.token_urlsafe(24)


class EmbedWidget(models.Model):
    """A public, unauthenticated door into one Workspace's Knowledge —
    embedded via <script> on a third-party site (knowledge/views.py::
    embed_ask_view). `public_key` is deliberately long/random since it's
    exposed in client-side JS on an arbitrary domain (same trust model as
    a Stripe.js publishable key: not secret, just unguessable enough to
    not be trivially enumerated). `is_active` lets the owner kill a
    widget without losing its history/config."""

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="embed_widgets"
    )
    public_key = models.CharField(
        max_length=40, unique=True, default=_generate_public_key, editable=False
    )
    title = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.workspace_id} embed {self.public_key[:8]}…"


class Chunk(models.Model):
    """Один фрагмент текста источника + его embedding. embedding хранится
    как JSON-список float, а не через pgvector — при ожидаемом для MVP
    размере корпуса (личные workspace, не миллионы чанков) косинусное
    сходство считается в Python/numpy на лету, без изменения образа
    Postgres ради индекса, который пока не нужен."""

    source = models.ForeignKey(
        Source, on_delete=models.CASCADE, related_name="chunks"
    )
    index = models.PositiveIntegerField()
    text = models.TextField()
    embedding = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["source_id", "index"]

    def __str__(self):
        return f"{self.source_id} chunk #{self.index}"
