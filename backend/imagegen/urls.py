from django.urls import path

from imagegen.views import ImageDetailView, ImageEditView, ImageGalleryView

urlpatterns = [
    path("images/", ImageGalleryView.as_view(), name="image-gallery"),
    path("images/edit/", ImageEditView.as_view(), name="image-edit"),
    path("images/<int:pk>/", ImageDetailView.as_view(), name="image-detail"),
]
