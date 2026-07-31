from django.conf import settings
from django.db import models

from media_ops.models import MediaStatus


class CodeExecution(models.Model):
    """Python code submitted from Studio's "Код" mode, run through a
    self-hosted Piston instance (piston_adapter.py — see docker-compose.yml
    for why self-hosted: the public Piston API stopped being freely
    available to commercial projects in 2026). No file/chart artifacts —
    only stdout/stderr/exit_code, same v1 scope cut as the rest of this
    feature. Only Python is offered (no user-facing language picker), but
    language/version are still stored per-record for consistency with
    every other media_ops-style job record and in case a second language
    is curated in later."""

    Status = MediaStatus

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="code_executions",
    )
    code = models.TextField()
    language = models.CharField(max_length=32, default="python")
    version = models.CharField(max_length=32, blank=True, default="")
    stdout = models.TextField(blank=True, default="")
    stderr = models.TextField(blank=True, default="")
    exit_code = models.IntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
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
        return f"{self.user} code execution {self.status}"
