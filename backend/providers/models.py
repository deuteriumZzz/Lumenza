from django.conf import settings
from django.db import models


class RequestLog(models.Model):
    class Status(models.TextChoices):
        OK = "ok", "OK"
        ERROR = "error", "Error"
        INSUFFICIENT_CREDITS = "insufficient_credits", "Insufficient credits"
        BLOCKED = "blocked", "Blocked by moderation"
        TASK_LOCKED = "task_locked", "Task locked (free tier)"
        MODEL_LOCKED = "model_locked", "Model locked (free tier)"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="request_logs",
    )
    provider = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    task = models.CharField(max_length=16, default="repurpose")
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    latency_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.OK
    )
    error_message = models.TextField(blank=True, default="")
    mocked = models.BooleanField(default=False)
    used_fallback = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.provider}/{self.model} {self.status}"


class Thread(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_threads",
    )
    title = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    # Обновляется через auto_now при добавлении сообщения — сортировка
    # сайдбара по последней активности, а не по дате создания (как в
    # ChatGPT: последний активный тред всегда сверху).
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or f"Thread {self.pk}"


class Message(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    thread = models.ForeignKey(
        Thread, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    text = models.TextField()
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    task = models.CharField(max_length=16, blank=True, default="")
    mocked = models.BooleanField(default=False)
    used_fallback = models.BooleanField(default=False)
    credits_charged = models.DecimalField(
        max_digits=12, decimal_places=4, default=0
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.thread_id} {self.role}"
