from django.urls import path

from videogen.views import VideoAnimateView, VideoDetailView, VideoGalleryView

urlpatterns = [
    path("videos/", VideoGalleryView.as_view(), name="video-gallery"),
    path("videos/animate/", VideoAnimateView.as_view(), name="video-animate"),
    path("videos/<int:pk>/", VideoDetailView.as_view(), name="video-detail"),
]
