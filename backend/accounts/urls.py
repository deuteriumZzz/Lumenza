from django.urls import path

from accounts.views import (
    UserContextView,
    login_view,
    logout_view,
    me,
    register,
    telegram_auth,
    user_pet,
)

urlpatterns = [
    path("register/", register, name="register"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("me/", me, name="me"),
    path("me/pet/", user_pet, name="user-pet"),
    path("context/", UserContextView.as_view(), name="user-context"),
    path("telegram/", telegram_auth, name="telegram-auth"),
]
