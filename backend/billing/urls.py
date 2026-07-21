from django.urls import path

from billing.views import (
    balance,
    sandbox_topup,
    subscribe,
    subscription_status,
    topup,
    unsubscribe,
    yookassa_webhook,
)

urlpatterns = [
    path("balance/", balance, name="balance"),
    path("topup/sandbox/", sandbox_topup, name="sandbox-topup"),
    path("topup/", topup, name="topup"),
    path("topup/yookassa/webhook/", yookassa_webhook, name="yookassa-webhook"),
    path("subscription/", subscription_status, name="subscription-status"),
    path("subscription/subscribe/", subscribe, name="subscribe"),
    path("subscription/cancel/", unsubscribe, name="unsubscribe"),
]
