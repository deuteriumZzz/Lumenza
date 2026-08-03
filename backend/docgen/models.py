import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _upload_to_pptx(instance, filename):
    folder = f"generated_presentations/{timezone.now():%Y/%m}"
    return f"{folder}/{uuid.uuid4().hex}.pptx"


def _upload_to_excel(instance, filename):
    folder = f"generated_spreadsheets/{timezone.now():%Y/%m}"
    return f"{folder}/{uuid.uuid4().hex}.xlsx"


class GeneratedPresentation(models.Model):
    """A real .pptx built by docgen.pptx_builder.build_presentation() for
    an agents.tasks._run_pptx_generation_step call. Always status=OK —
    created directly (no PENDING/claim flow, nothing polls it) purely to
    reuse FileField/media-serving plumbing, same as videogen.GeneratedVideo/
    media_ops.SpeechClip. No `mocked` field: unlike Replicate/NVIDIA TTS,
    there is no external API to fall back from — output is always real."""

    class Status(models.TextChoices):
        OK = "ok", "OK"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generated_presentations",
    )
    source_text = models.TextField(max_length=4000)
    file = models.FileField(upload_to=_upload_to_pptx, blank=True, null=True)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.OK
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} presentation {self.status}"


class GeneratedSpreadsheet(models.Model):
    """A real .xlsx built by docgen.excel_builder.build_spreadsheet() for
    an agents.tasks._run_excel_generation_step call. Same shape/reasoning
    as GeneratedPresentation above."""

    class Status(models.TextChoices):
        OK = "ok", "OK"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="generated_spreadsheets",
    )
    source_text = models.TextField(max_length=4000)
    file = models.FileField(upload_to=_upload_to_excel, blank=True, null=True)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.OK
    )
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} spreadsheet {self.status}"
