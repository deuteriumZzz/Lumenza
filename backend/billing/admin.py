from django.contrib import admin

from billing.models import CreditAccount, LedgerEntry, Payment, Subscription


@admin.register(CreditAccount)
class CreditAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "updated_at")
    list_select_related = ("user",)
    search_fields = ("user__username", "user__email")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = (
        "account",
        "amount",
        "reason",
        "balance_after",
        "created_at",
    )
    list_filter = ("reason",)
    # __str__ dereferences account.user, so the select needs to reach
    # two hops — "account__user" alone also joins "account" along the
    # way.
    list_select_related = ("account__user",)
    search_fields = ("account__user__username",)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "amount_rub",
        "credits_amount",
        "status",
        "kind",
        "yookassa_payment_id",
        "created_at",
    )
    list_filter = ("status", "kind")
    list_select_related = ("user",)
    search_fields = ("user__username", "yookassa_payment_id")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "status",
        "price_rub",
        "current_period_end",
        "canceled_at",
    )
    list_filter = ("status",)
    list_select_related = ("user",)
    search_fields = ("user__username",)
