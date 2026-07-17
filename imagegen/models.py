import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _upload_to(instance, filename):
    # A predictable path (e.g. the row's own pk) would make generated
    # images enumerable by URL under Django's dev static-file serving,
    # which has no auth check at all — see lumenza/urls.py. The uuid makes
    # the URL itself the access control until real object storage/signed
    # URLs replace this in production.
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    return f"generated/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{ext}"


class GeneratedImage(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        OK = "ok", "OK"
        ERROR = "error", "Error"
        INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
        BLOCKED = "blocked", "Blocked by moderation"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="generated_images"
    )
    prompt = models.TextField(max_length=4000)
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    image = models.ImageField(upload_to=_upload_to, blank=True, null=True)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    # While status=pending this holds the reserved credit hold; once the
    # Celery task finishes it holds the final (reconciled) charge.
    credits_charged = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.provider}/{self.model} {self.status}"
