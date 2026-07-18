from django.contrib import admin
from django.template.response import TemplateResponse

from core.models import AnomalyFlag, MarginDashboard
from core.services import margin_dashboard_data


@admin.register(AnomalyFlag)
class AnomalyFlagAdmin(admin.ModelAdmin):
    list_display = ("user", "reason", "detail", "created_at")
    list_filter = ("reason",)
    search_fields = ("user__username",)


@admin.register(MarginDashboard)
class MarginDashboardAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Not a real changelist — this model has no table (see core.models.
        # MarginDashboard). The whole point of registering it is to get an
        # admin-authenticated URL/nav entry to hang this custom report off.
        data = margin_dashboard_data()
        context = {
            **self.admin_site.each_context(request),
            "title": "Margin dashboard",
            "data": data,
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "admin/core/margindashboard/change_list.html", context)
