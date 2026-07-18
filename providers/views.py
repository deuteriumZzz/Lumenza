from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from providers.models import RequestLog
from providers.serializers import ChatRequestSerializer, RequestLogSerializer
from providers.services import run_chat


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = run_chat(
        request.user, serializer.validated_data["prompt"], serializer.validated_data["mode"]
    )

    if outcome.status == "insufficient_credits":
        return Response({"detail": "Insufficient credits"}, status=status.HTTP_402_PAYMENT_REQUIRED)
    if outcome.status == "provider_error":
        return Response({"detail": "Provider error"}, status=status.HTTP_502_BAD_GATEWAY)

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
        return RequestLog.objects.filter(user=self.request.user)
