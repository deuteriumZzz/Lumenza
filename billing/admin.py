from django.contrib import admin

from billing.models import CreditAccount, LedgerEntry


@admin.register(CreditAccount)
class CreditAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "updated_at")
    search_fields = ("user__username", "user__email")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("account", "amount", "reason", "balance_after", "created_at")
    list_filter = ("reason",)
    search_fields = ("account__user__username",)
