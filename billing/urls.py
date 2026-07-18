from django.urls import path

from billing.views import balance, sandbox_topup, topup, yookassa_webhook

urlpatterns = [
    path("balance/", balance, name="balance"),
    path("topup/sandbox/", sandbox_topup, name="sandbox-topup"),
    path("topup/", topup, name="topup"),
    path("topup/yookassa/webhook/", yookassa_webhook, name="yookassa-webhook"),
]
