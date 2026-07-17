from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    grant_credits,
    usd_to_credits,
)
from imagegen.models import GeneratedImage
from imagegen.pricing import estimate_image_cost_usd
from imagegen.serializers import GeneratedImageSerializer, ImageRequestSerializer
from imagegen.tasks import generate_image_task

# Public provider key (from ImageRequestSerializer) -> (adapter registry key, model).
IMAGE_ROUTES = {
    "openai": ("openai", "dall-e-3"),
    "flux": ("replicate", "flux-schnell"),
}


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
        prompt = serializer.validated_data["prompt"]
        provider_key = serializer.validated_data["provider"]
        provider_name, model = IMAGE_ROUTES[provider_key]

        get_or_create_account(request.user)
        hold_credits = usd_to_credits(estimate_image_cost_usd(model))

        # Charge the hold and create the record as one unit: if either the
        # charge or the row creation raises, nothing is left half-done.
        try:
            with transaction.atomic():
                charge_credits(request.user, hold_credits, reason=LedgerEntry.Reason.IMAGE_REQUEST)
                record = GeneratedImage.objects.create(
                    user=request.user,
                    prompt=prompt,
                    provider=provider_name,
                    model=model,
                    status=GeneratedImage.Status.PENDING,
                    credits_charged=hold_credits,
                )
        except InsufficientCreditsError:
            return Response({"detail": "Insufficient credits"}, status=status.HTTP_402_PAYMENT_REQUIRED)

        # The charge+create transaction above has already committed by this
        # point, so the worker can safely see the row. If enqueueing itself
        # fails (broker down, etc.), the record would otherwise sit charged
        # and PENDING forever with nothing to ever process it — refund and
        # mark it failed synchronously instead of leaving that behind.
        try:
            generate_image_task.delay(record.id)
        except Exception:
            grant_credits(request.user, hold_credits, reason=LedgerEntry.Reason.REFUND)
            record.status = GeneratedImage.Status.ERROR
            record.credits_charged = Decimal("0")
            record.error_message = "Failed to enqueue image generation"
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "credits_charged", "error_message", "completed_at"])
            return Response(
                {"detail": "Image generation is temporarily unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        output = GeneratedImageSerializer(record, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_202_ACCEPTED)


class ImageDetailView(generics.RetrieveAPIView):
    serializer_class = GeneratedImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GeneratedImage.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        return {"request": self.request}
