from django.urls import path

from billing.views import balance, sandbox_topup

urlpatterns = [
    path("balance/", balance, name="balance"),
    path("topup/sandbox/", sandbox_topup, name="sandbox-topup"),
]
