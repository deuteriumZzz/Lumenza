from django.urls import path

from imagegen.views import (
    ImageDetailView,
    ImageEditView,
    ImageGalleryView,
    ImageUpscaleView,
)

urlpatterns = [
    path("images/", ImageGalleryView.as_view(), name="image-gallery"),
    path("images/edit/", ImageEditView.as_view(), name="image-edit"),
    path(
        "images/upscale/", ImageUpscaleView.as_view(), name="image-upscale"
    ),
    path("images/<int:pk>/", ImageDetailView.as_view(), name="image-detail"),
]
