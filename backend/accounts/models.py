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
