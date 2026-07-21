from decimal import Decimal

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from billing.services import grant_credits


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def grant_signup_bonus(sender, instance, created, **kwargs):
    if not created:
        return
    grant_credits(
        instance, Decimal(str(settings.SIGNUP_BONUS_CREDITS)), "signup_bonus"
    )
