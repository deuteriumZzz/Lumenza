from celery import shared_task
from django.utils import timezone

from billing.models import Subscription
from billing.services import renew_subscription


def renew_due_subscriptions() -> int:
    """Charges every ACTIVE subscription whose current_period_end has
    passed. Returns the count processed (successes and failures both —
    renew_subscription already handles marking a failed charge PAST_DUE and
    downgrading the user)."""
    due = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE,
        current_period_end__lte=timezone.now(),
    )
    count = 0
    for subscription in due:
        renew_subscription(subscription)
        count += 1
    return count


renew_subscriptions_task = shared_task(name="billing.renew_subscriptions")(
    renew_due_subscriptions
)
