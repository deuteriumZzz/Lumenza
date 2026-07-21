from django.urls import path

from referrals.views import referral_stats

urlpatterns = [
    path("referrals/", referral_stats, name="referral-stats"),
]
