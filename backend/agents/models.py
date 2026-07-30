from django.conf import settings
from django.db import models


class Agent(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    # Only domains with a real, published agent behind them belong here —
    # add a value exactly when that domain's first agent ships (see
    # SPEC.md Phase 16), not ahead of time as a placeholder.
    class Category(models.TextChoices):
        CONTENT = "content", "Контент"
        RESEARCH = "research", "Исследования"
        DOCUMENTS = "documents", "Документы"

    slug = models.SlugField(unique=True, max_length=64)
    name = models.CharField(max_length=120)
    description = models.TextField(max_length=500)
    category = models.CharField(max_length=32, choices=Category.choices)
    # Snapshotted onto each AgentRun at creation time so a later edit to
    # an Agent's config never rewrites history for runs already in flight
    # or completed.
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    # {"fields": [{"key","label","type","required","options"?,"max_length"?}, ...]}
    input_schema = models.JSONField()
    system_instructions = models.TextField()
    # [{"key","label","task"}, ...] — ordered; "task" must be a key in
    # providers.services.TASK_ROUTES.
    workflow_steps = models.JSONField()
    # Reserved for later per-step model pinning; empty for v1 (auto-fallback only).
    model_policy = models.JSONField(default=dict, blank=True)
    # Reserved for Phase 17 (external actions); empty for v1.
    tool_policy = models.JSONField(default=dict, blank=True)
    output_schema = models.JSONField()
    # Reserved for an automated eval runner; not executed anywhere yet.
    eval_set = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.slug} v{self.version} ({self.status})"


class AgentRun(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        OK = "ok", "OK"
        ERROR = "error", "Error"
        INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
        BLOCKED = "blocked", "Blocked by moderation"

    agent = models.ForeignKey(
        Agent, on_delete=models.PROTECT, related_name="runs"
    )
    agent_version = models.PositiveIntegerField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_runs",
    )
    input_payload = models.JSONField()
    idempotency_key = models.CharField(max_length=64)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.PENDING
    )
    # [{"key","label","status","provider"?,"model"?,"used_fallback"?,
    #   "credits_charged"?,"error_message"?,"started_at"?,"completed_at"?}, ...]
    steps = models.JSONField(default=list, blank=True)
    result = models.JSONField(null=True, blank=True)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "agent", "idempotency_key")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.agent.slug} run #{self.pk} ({self.status})"
