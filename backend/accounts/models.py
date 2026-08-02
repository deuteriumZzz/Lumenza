import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


def _user_pet_upload_to(instance, filename):
    """Keep public media paths unguessable and independent of usernames."""

    suffix = Path(filename).suffix.lower()
    if suffix == ".jpeg":
        suffix = ".jpg"
    if suffix not in {".jpg", ".png", ".webp"}:
        # The API validates the decoded format before the model is saved. The
        # fallback keeps direct/admin assignments from preserving an unsafe or
        # misleading extension in storage.
        suffix = ".img"
    return f"user-pets/{uuid.uuid4().hex}{suffix}"


class User(AbstractUser):
    class Tier(models.TextChoices):
        FREE = "free", "Free"
        PAID = "paid", "Paid"

    class PetPreset(models.TextChoices):
        """Built-in animated companions offered in the profile gallery,
        as an alternative to uploading a custom static image."""

        FOX = "fox", "Fox"
        CAT = "cat", "Cat"
        ROBOT = "robot", "Robot"
        DRAGON = "dragon", "Dragon"
        RABBIT = "rabbit", "Rabbit"
        BLOB = "blob", "Blob"

    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    tier = models.CharField(
        max_length=8, choices=Tier.choices, default=Tier.FREE
    )
    pet_name = models.CharField(max_length=40, blank=True, default="")
    pet_image = models.ImageField(
        upload_to=_user_pet_upload_to,
        blank=True,
        null=True,
    )
    pet_preset = models.CharField(
        max_length=12, choices=PetPreset.choices, blank=True, default=""
    )
    show_pet = models.BooleanField(default=False)


class UserContext(models.Model):
    """One free-text profile per user, merged into agent prompts (see
    agents.services.render_step_prompt) so agents stop re-asking the same
    background questions on every run. Shape (all keys optional):
    {"general": {"tone","banned_topics"},
     "content": {"niche","audience","products","examples"},
     "research": {"topics","depth"},
     "documents": {"typical_formats"},
     "finance": {"topics","risk_profile"}}
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
