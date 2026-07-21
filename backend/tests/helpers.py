from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def make_user(username="testuser", tier=None, password="strongpass123"):
    kwargs = {"username": username, "password": password}
    if tier is not None:
        kwargs["tier"] = tier
    return User.objects.create_user(**kwargs)


def authed_client(username="testuser", tier=None, password="strongpass123"):
    user = make_user(username, tier=tier, password=password)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user
