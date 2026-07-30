from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Tier(models.TextChoices):
        FREE = "free", "Free"
        PAID = "paid", "Paid"

    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    tier = models.CharField(
        max_length=8, choices=Tier.choices, default=Tier.FREE
    )


class UserContext(models.Model):
    """One free-text profile per user, merged into agent prompts (see
    agents.services.render_step_prompt) so agents stop re-asking the same
    background questions on every run. Shape (all keys optional):
    {"general": {"tone","banned_topics"},
     "content": {"niche","audience","products","examples"},
     "research": {"topics","depth"},
     "documents": {"typical_formats"}}
    Domain blocks match agents.models.Agent.Category — add a block only
    once an agent in that category actually reads it."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="context",
    )
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} context"
