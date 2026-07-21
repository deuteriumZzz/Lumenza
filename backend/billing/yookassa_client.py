import base64
import json
import urllib.error
import urllib.request
import uuid

from django.conf import settings

API_BASE = "https://api.yookassa.ru/v3"


class YooKassaError(Exception):
    pass


def _request(
    method: str,
    path: str,
    body: dict | None = None,
    idempotency_key: str | None = None,
) -> dict:
    credentials = base64.b64encode(
        f"{settings.YOOKASSA_SHOP_ID}:{settings.YOOKASSA_SECRET_KEY}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/json",
    }
    if method == "POST":
        # Требуется YooKassa при создании платежа: без этого повторная
        # отправка того же запроса из-за сетевого сбоя у клиента создала
        # бы второй, отдельный платёж вместо возврата исходного.
        headers["Idempotence-Key"] = idempotency_key or str(uuid.uuid4())

    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API_BASE}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise YooKassaError(
            f"YooKassa API error {exc.code}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise YooKassaError(f"YooKassa API unreachable: {exc}") from exc


def create_payment(
    amount_rub,
    return_url: str,
    description: str,
    save_payment_method: bool = False,
) -> dict:
    """Создаёт платёж и возвращает сырой объект платежа YooKassa, который
    включает `id` (для сохранения в нашей строке Payment) и
    `confirmation.confirmation_url` (куда браузер перенаправляется для
    оплаты).

    save_payment_method=True (только для подписок) просит YooKassa
    сохранить переиспользуемый payment_method.id при успехе этого платежа,
    который charge_saved_payment_method() ниже сможет затем списать снова
    без возврата в браузер — именно это делает возможным периодический
    биллинг."""
    body = {
        "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": description,
    }
    if save_payment_method:
        body["save_payment_method"] = True
    return _request("POST", "/payments", body)


def charge_saved_payment_method(
    payment_method_id: str,
    amount_rub,
    description: str,
    idempotency_key: str,
) -> dict:
    """Списание без участия пользователя (off-session) с ранее сохранённого
    способа оплаты — без блока `confirmation`, поскольку тут нет
    перенаправления браузера. Используется
    billing.tasks.renew_subscriptions, чтобы автоматически списывать
    следующий период подписки."""
    return _request(
        "POST",
        "/payments",
        {
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "payment_method_id": payment_method_id,
            "capture": True,
            "description": description,
        },
        idempotency_key=idempotency_key,
    )


def get_payment(yookassa_payment_id: str) -> dict:
    """Запрашивает у самой YooKassa авторитетный статус платежа напрямую.

    Намеренно не доверяем статусу из тела POST-запроса вебхука: кто угодно
    может угадать путь URL платежа и отправить POST с произвольным
    поддельным уведомлением "succeeded". Повторный запрос платежа у
    YooKassa с нашим собственным секретным ключом означает, что реальное
    решение о начислении кредитов всегда основано на том, что подтверждает
    сама YooKassa, а не на содержимом непроверенного запроса.
    """
    return _request("GET", f"/payments/{yookassa_payment_id}")
