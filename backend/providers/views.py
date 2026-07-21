from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from providers.models import RequestLog
from providers.serializers import (
    ChatRequestSerializer,
    HistoryFilterSerializer,
    RequestLogSerializer,
)
from providers.services import run_chat
from providers.throttling import ChatRateThrottle


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatRateThrottle])
def chat(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = run_chat(
        request.user,
        serializer.validated_data["prompt"],
        serializer.validated_data["task"],
        model=serializer.validated_data.get("model") or None,
    )

    if outcome.status == "task_locked":
        return Response(
            {
                "detail": "This task isn't unlocked on your plan yet",
                "code": "task_locked",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if outcome.status == "model_locked":
        return Response(
            {
                "detail": "This model isn't unlocked on your plan yet",
                "code": "model_locked",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if outcome.status == "insufficient_credits":
        return Response(
            {"detail": "Insufficient credits"},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )
    if outcome.status == "provider_error":
        return Response(
            {"detail": "Provider error"}, status=status.HTTP_502_BAD_GATEWAY
        )
    if outcome.status == "blocked":
        return Response(
            {"detail": "This prompt was blocked by moderation"},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    return Response(
        {
            "text": outcome.text,
            "provider": outcome.provider,
            "model": outcome.model,
            "mocked": outcome.mocked,
            "used_fallback": outcome.used_fallback,
            "credits_charged": str(outcome.credits_charged),
            "balance": str(outcome.balance),
        }
    )


class HistoryPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class ChatHistoryView(generics.ListAPIView):
    serializer_class = RequestLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = HistoryPagination

    def get_queryset(self):
        serializer = HistoryFilterSerializer(data=self.request.query_params)
        serializer.is_valid(raise_exception=True)
        filters = serializer.validated_data
        queryset = RequestLog.objects.filter(user=self.request.user)

        for field in ("task", "provider", "status"):
            if field in filters:
                queryset = queryset.filter(**{field: filters[field]})
        if "created_after" in filters:
            queryset = queryset.filter(
                created_at__gte=filters["created_after"]
            )
        if "created_before" in filters:
            queryset = queryset.filter(
                created_at__lt=filters["created_before"]
            )
        return queryset
