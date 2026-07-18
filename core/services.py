from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from core.models import AnomalyFlag
from imagegen.models import GeneratedImage
from providers.models import RequestLog

DEFAULT_WINDOW_DAYS = 30
# How many (provider, model) combinations to surface in the error table —
# enough to catch a flaky provider without letting one noisy row bury it in
# a long tail of one-off failures.
TOP_ERROR_LIMIT = 20

# Threshold and window for flagging a user who keeps hitting the moderation
# blocklist — occasional false positives happen, but this many within an
# hour looks like probing rather than accidental phrasing.
MODERATION_BLOCK_ANOMALY_THRESHOLD = 3
MODERATION_BLOCK_ANOMALY_WINDOW = timedelta(hours=1)


def flag_repeated_moderation_blocks(user) -> None:
    """Called after a moderation block on either surface (chat or image
    generation). Creates one AnomalyFlag the first time a user crosses the
    threshold within the window, not one per block past it — otherwise a
    single bad actor floods the admin with duplicate flags instead of one
    actionable signal."""
    since = timezone.now() - MODERATION_BLOCK_ANOMALY_WINDOW
    recent_blocks = (
        RequestLog.objects.filter(user=user, status=RequestLog.Status.BLOCKED, created_at__gte=since).count()
        + GeneratedImage.objects.filter(
            user=user, status=GeneratedImage.Status.BLOCKED, created_at__gte=since
        ).count()
    )
    if recent_blocks < MODERATION_BLOCK_ANOMALY_THRESHOLD:
        return

    already_flagged = AnomalyFlag.objects.filter(
        user=user, reason=AnomalyFlag.Reason.REPEATED_MODERATION_BLOCKS, created_at__gte=since
    ).exists()
    if already_flagged:
        return

    AnomalyFlag.objects.create(
        user=user,
        reason=AnomalyFlag.Reason.REPEATED_MODERATION_BLOCKS,
        detail=f"{recent_blocks} blocked prompts in the last hour",
    )


@dataclass
class UserDayRow:
    user: str
    day: object
    requests: int = 0
    cost_usd: Decimal = Decimal("0")
    revenue_usd: Decimal = Decimal("0")

    @property
    def margin_usd(self) -> Decimal:
        return self.revenue_usd - self.cost_usd


@dataclass
class ErrorSourceRow:
    source: str
    provider: str
    model: str
    count: int


@dataclass
class MarginDashboardData:
    window_days: int
    by_user_day: list = field(default_factory=list)
    top_errors: list = field(default_factory=list)
    total_cost_usd: Decimal = Decimal("0")
    total_revenue_usd: Decimal = Decimal("0")
    total_requests: int = 0

    @property
    def total_margin_usd(self) -> Decimal:
        return self.total_revenue_usd - self.total_cost_usd


def margin_dashboard_data(window_days: int = DEFAULT_WINDOW_DAYS) -> MarginDashboardData:
    """Aggregates provider spend vs. what was charged to users, by user/day,
    plus the noisiest (provider, model) error sources — the Phase 7 admin
    margin dashboard's data, kept as a plain function so it's testable
    without rendering any HTML."""
    since = timezone.now() - timedelta(days=window_days)
    credit_usd_value = Decimal(str(settings.CREDIT_USD_VALUE))

    by_user_day: dict[tuple[str, object], UserDayRow] = {}

    def _accumulate(queryset):
        rows = (
            queryset.filter(created_at__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("user__username", "day")
            .annotate(cost_usd=Sum("cost_usd"), credits_charged=Sum("credits_charged"), requests=Count("id"))
        )
        for row in rows:
            key = (row["user__username"], row["day"])
            entry = by_user_day.setdefault(key, UserDayRow(user=row["user__username"], day=row["day"]))
            entry.cost_usd += row["cost_usd"] or Decimal("0")
            entry.revenue_usd += (row["credits_charged"] or Decimal("0")) * credit_usd_value
            entry.requests += row["requests"]

    _accumulate(RequestLog.objects.all())
    _accumulate(GeneratedImage.objects.all())

    ordered_rows = sorted(by_user_day.values(), key=lambda r: (r.day, r.user), reverse=True)

    top_errors: list[ErrorSourceRow] = []
    chat_errors = (
        RequestLog.objects.filter(created_at__gte=since, status=RequestLog.Status.ERROR)
        .values("provider", "model")
        .annotate(count=Count("id"))
    )
    for row in chat_errors:
        top_errors.append(ErrorSourceRow(source="chat", provider=row["provider"], model=row["model"], count=row["count"]))

    image_errors = (
        GeneratedImage.objects.filter(
            created_at__gte=since, status__in=[GeneratedImage.Status.ERROR, GeneratedImage.Status.BLOCKED]
        )
        .values("provider", "model", "status")
        .annotate(count=Count("id"))
    )
    for row in image_errors:
        source = "image_blocked" if row["status"] == GeneratedImage.Status.BLOCKED else "image"
        top_errors.append(ErrorSourceRow(source=source, provider=row["provider"], model=row["model"], count=row["count"]))

    top_errors.sort(key=lambda r: r.count, reverse=True)
    top_errors = top_errors[:TOP_ERROR_LIMIT]

    return MarginDashboardData(
        window_days=window_days,
        by_user_day=ordered_rows,
        top_errors=top_errors,
        total_cost_usd=sum((r.cost_usd for r in ordered_rows), Decimal("0")),
        total_revenue_usd=sum((r.revenue_usd for r in ordered_rows), Decimal("0")),
        total_requests=sum((r.requests for r in ordered_rows), 0),
    )
