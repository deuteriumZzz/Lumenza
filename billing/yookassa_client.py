import base64
import json
import uuid
import urllib.error
import urllib.request

from django.conf import settings

API_BASE = "https://api.yookassa.ru/v3"


class YooKassaError(Exception):
    pass


def _request(method: str, path: str, body: dict | None = None) -> dict:
    credentials = base64.b64encode(f"{settings.YOOKASSA_SHOP_ID}:{settings.YOOKASSA_SECRET_KEY}".encode()).decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json",
    }
    if method == "POST":
        # Required by YooKassa on payment creation: without it, a client's
        # network retry of the same request would create a second, separate
        # charge instead of returning the original payment.
        headers["Idempotence-Key"] = str(uuid.uuid4())

    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{API_BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise YooKassaError(f"YooKassa API error {exc.code}: {exc.read().decode(errors='replace')}") from exc
    except urllib.error.URLError as exc:
        raise YooKassaError(f"YooKassa API unreachable: {exc}") from exc


def create_payment(amount_rub, return_url: str, description: str) -> dict:
    """Creates a payment and returns the raw YooKassa payment object, which
    includes `id` (to store against our Payment row) and
    `confirmation.confirmation_url` (where the browser redirects to pay)."""
    return _request(
        "POST",
        "/payments",
        {
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "confirmation": {"type": "redirect", "return_url": return_url},
            "capture": True,
            "description": description,
        },
    )


def get_payment(yookassa_payment_id: str) -> dict:
    """Fetches a payment's authoritative status directly from YooKassa.

    Deliberately not trusting a webhook POST body for the status itself:
    anyone can guess a payment's URL path and POST an arbitrary fake
    "succeeded" notification. Re-fetching the payment from YooKassa with
    our own secret key means the actual credit decision is always based on
    what YooKassa itself confirms, not on unauthenticated request content.
    """
    return _request("GET", f"/payments/{yookassa_payment_id}")
