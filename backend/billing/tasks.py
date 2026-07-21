from celery import shared_task
from django.utils import timezone

from billing.models import Subscription
from billing.services import (
    expire_nonrenewing_subscription,
    renew_subscription,
)


def renew_due_subscriptions() -> int:
    """Process every subscription whose current paid period has ended.

    ACTIVE subscriptions are charged for renewal. NON_RENEWING subscriptions
    are expired and their users downgraded. Returns the count processed;
    renew_subscription handles failed charges and their state transitions.
    """
    due = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE,
        current_period_end__lte=timezone.now(),
    )
    count = 0
    for subscription in due:
        renew_subscription(subscription)
        count += 1
    expiring = Subscription.objects.filter(
        status=Subscription.Status.NON_RENEWING,
        current_period_end__lte=timezone.now(),
    )
    for subscription in expiring:
        if expire_nonrenewing_subscription(subscription):
            count += 1
    return count


renew_subscriptions_task = shared_task(name="billing.renew_subscriptions")(
    renew_due_subscriptions
)
