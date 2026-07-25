from django.urls import path

from progression.views import models_catalog, models_progress, progress

urlpatterns = [
    path("progress/", progress, name="progress"),
    path("progress/models/", models_catalog, name="models-catalog"),
    path(
        "progress/models/<str:task>/", models_progress, name="models-progress"
    ),
]
