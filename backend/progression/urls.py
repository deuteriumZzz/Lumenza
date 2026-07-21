from django.urls import path

from progression.views import models_progress, progress

urlpatterns = [
    path("progress/", progress, name="progress"),
    path(
        "progress/models/<str:task>/", models_progress, name="models-progress"
    ),
]
