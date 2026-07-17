from django.urls import path

from imagegen.views import ImageDetailView, ImageGalleryView

urlpatterns = [
    path("images/", ImageGalleryView.as_view(), name="image-gallery"),
    path("images/<int:pk>/", ImageDetailView.as_view(), name="image-detail"),
]
