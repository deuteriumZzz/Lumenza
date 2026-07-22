from django.urls import path

from accounts.views import (
    login_view,
    logout_view,
    me,
    register,
    telegram_auth,
)

urlpatterns = [
    path("register/", register, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("me/", me, name="me"),
    path("telegram/", telegram_auth, name="telegram-auth"),
]
