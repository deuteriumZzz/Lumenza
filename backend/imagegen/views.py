from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.responses import locked_or
from imagegen.models import GeneratedImage
from imagegen.serializers import (
    GeneratedImageSerializer,
    ImageEditRequestSerializer,
    ImageRequestSerializer,
)
from imagegen.services import start_image_edit, start_image_generation
from imagegen.throttling import ImageGenerationRateThrottle


class ImagePagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class ImageGalleryView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = ImagePagination

    def get_throttles(self):
        # Ограничение частоты действует только на сам запрос генерации —
        # просмотр собственной галереи (GET) не должен расходовать тот
        # же лимит.
        if self.request.method == "POST":
            return [ImageGenerationRateThrottle()]
        return []

    def get_queryset(self):
        return GeneratedImage.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        return (
            ImageRequestSerializer
            if self.request.method == "POST"
            else GeneratedImageSerializer
        )

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = start_image_generation(
            request.user,
            serializer.validated_data["prompt"],
            serializer.validated_data["task"],
        )

        output = GeneratedImageSerializer(
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
            enqueue_failed_detail=(
                "Image generation is temporarily unavailable"
            ),
        )


class ImageEditView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]
    serializer_class = ImageEditRequestSerializer
    throttle_classes = [ImageGenerationRateThrottle]

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = start_image_edit(
            request.user,
            serializer.validated_data["prompt"],
            serializer.validated_data["image"],
        )

        output = GeneratedImageSerializer(
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
            enqueue_failed_detail="Image editing is temporarily unavailable",
        )


class ImageDetailView(generics.RetrieveAPIView):
    serializer_class = GeneratedImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GeneratedImage.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}
