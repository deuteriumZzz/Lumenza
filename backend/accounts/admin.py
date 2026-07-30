from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from accounts.models import User, UserContext

admin.site.register(User, UserAdmin)


@admin.register(UserContext)
class UserContextAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at")
    list_select_related = ("user",)
    search_fields = ("user__username",)
