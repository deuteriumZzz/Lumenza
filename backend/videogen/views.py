from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.responses import locked_or
from videogen.models import GeneratedVideo
from videogen.serializers import (
    GeneratedVideoSerializer,
    VideoAnimateRequestSerializer,
    VideoRequestSerializer,
)
from videogen.services import start_video_animation, start_video_generation
from videogen.throttling import VideoGenerationRateThrottle


class VideoPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class VideoGalleryView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = VideoPagination

    def get_throttles(self):
        if self.request.method == "POST":
            return [VideoGenerationRateThrottle()]
        return []

    def get_queryset(self):
        return GeneratedVideo.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        return (
            VideoRequestSerializer
            if self.request.method == "POST"
            else GeneratedVideoSerializer
        )

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = start_video_generation(
            request.user, serializer.validated_data["prompt"]
        )

        output = GeneratedVideoSerializer(
            outcome.record, context=self.get_serializer_context()
        )
        ok = (
            Response(output.data, status=status.HTTP_202_ACCEPTED)
            if outcome.record
            else None
        )
        return locked_or(
            outcome,
            ok,
            enqueue_failed_detail="Video generation is temporarily unavailable",
        )


class VideoAnimateView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]
    serializer_class = VideoAnimateRequestSerializer
    throttle_classes = [VideoGenerationRateThrottle]

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = start_video_animation(
            request.user,
            serializer.validated_data["prompt"],
            serializer.validated_data["image"],
        )

        output = GeneratedVideoSerializer(
            outcome.record, context=self.get_serializer_context()
        )
        ok = (
            Response(output.data, status=status.HTTP_202_ACCEPTED)
            if outcome.record
            else None
        )
        return locked_or(
            outcome,
            ok,
            enqueue_failed_detail="Video animation is temporarily unavailable",
        )


class VideoDetailView(generics.RetrieveAPIView):
    serializer_class = GeneratedVideoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GeneratedVideo.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}
