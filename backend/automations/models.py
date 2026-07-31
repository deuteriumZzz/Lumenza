from django.conf import settings
from django.db import models

from agents.models import Agent, AgentRun


class TelegramChannel(models.Model):
    """A chat/channel the bot can post to on this user's behalf — verified
    once at connect time via Telegram's getChat (confirms the bot can see
    this chat_id at all), NOT verified for posting/admin rights, which only
    surfaces at actual send time (see automations.tasks.send_pending_action)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="telegram_channels",
    )
    chat_id = models.BigIntegerField()
    title = models.CharField(max_length=255, blank=True, default="")
    connected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "chat_id")
        ordering = ["-connected_at"]

    def __str__(self):
        return f"{self.user} -> {self.title or self.chat_id}"


class ScheduledAgentRun(models.Model):
    """Runs `agent` once a day at hour:minute (UTC) with a fixed
    input_payload — no cron/weekly recurrence in v1. If publish_channel is
    set, a completed run gets a PendingAction draft auto-created for
    review (never auto-sent — see PendingAction docstring)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scheduled_agent_runs",
    )
    agent = models.ForeignKey(
        Agent, on_delete=models.PROTECT, related_name="schedules"
    )
    input_payload = models.JSONField()
    hour = models.PositiveSmallIntegerField()
    minute = models.PositiveSmallIntegerField(default=0)
    publish_channel = models.ForeignKey(
        TelegramChannel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="schedules",
    )
    is_active = models.BooleanField(default=True)
    next_run_at = models.DateTimeField()
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_agent_run = models.ForeignKey(
        AgentRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["next_run_at"]

    def __str__(self):
        return f"{self.user} {self.agent.slug} @ {self.hour:02d}:{self.minute:02d}"


class PendingAction(models.Model):
    """A draft external action awaiting explicit user confirmation before
    it does anything — SPEC.md Phase 17: "внешнее действие невозможно
    выполнить без подтверждения пользователя". This row IS the audit log
    (same convention as AgentRun/CodeExecution elsewhere in this codebase —
    no separate audit table anywhere): status transitions and timestamps
    are the full trail of what was proposed, who confirmed it, and when it
    was actually sent (or why it failed)."""

    class Status(models.TextChoices):
        PENDING_CONFIRMATION = "pending_confirmation", "Pending confirmation"
        CONFIRMED = "confirmed", "Confirmed"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pending_actions",
    )
    agent_run = models.ForeignKey(
        AgentRun, on_delete=models.CASCADE, related_name="pending_actions"
    )
    channel = models.ForeignKey(
        TelegramChannel, on_delete=models.CASCADE, related_name="pending_actions"
    )
    text = models.TextField()
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.PENDING_CONFIRMATION,
    )
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} -> {self.channel} ({self.status})"
