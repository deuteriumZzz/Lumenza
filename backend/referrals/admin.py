from django.contrib import admin

from referrals.models import Referral


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = (
        "referrer",
        "referred",
        "status",
        "created_at",
        "rewarded_at",
    )
    list_filter = ("status",)
    list_select_related = ("referrer", "referred")
    search_fields = ("referrer__username", "referred__username")
