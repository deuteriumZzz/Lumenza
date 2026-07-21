from django.conf import settings
from django.db import models


class Referral(models.Model):
    """Рефералы через Telegram deep-ссылку (t.me/bot?start=ref_<id>).

    `referred` — OneToOne, а не FK — пользователь может быть приглашённой
    стороной ровно одного реферала, создаваемого ровно один раз в момент
    регистрации (см. referrals/services.py record_referral), именно это
    делает защиту от злоупотребления "один бонус на аккаунт" структурным
    свойством, а не проверкой, которую можно обойти гонкой или пропустить."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REWARDED = "rewarded", "Rewarded"

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referrals_made",
    )
    referred = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referred_by",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    rewarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.referrer} -> {self.referred} ({self.status})"
