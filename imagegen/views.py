from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from imagegen.models import GeneratedImage
from imagegen.serializers import GeneratedImageSerializer, ImageRequestSerializer
from imagegen.services import start_image_generation


class ImagePagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class ImageGalleryView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = ImagePagination

    def get_queryset(self):
        return GeneratedImage.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        return ImageRequestSerializer if self.request.method == "POST" else GeneratedImageSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outcome = start_image_generation(
            request.user,
            serializer.validated_data["prompt"],
            serializer.validated_data["provider"],
        )

        if outcome.status == "insufficient_credits":
            return Response({"detail": "Insufficient credits"}, status=status.HTTP_402_PAYMENT_REQUIRED)
        if outcome.status == "enqueue_failed":
            return Response(
                {"detail": "Image generation is temporarily unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        output = GeneratedImageSerializer(outcome.record, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_202_ACCEPTED)


class ImageDetailView(generics.RetrieveAPIView):
    serializer_class = GeneratedImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GeneratedImage.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}
