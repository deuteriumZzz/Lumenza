from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from providers.models import Message, RequestLog, Thread
from providers.serializers import (
    ChatRequestSerializer,
    HistoryFilterSerializer,
    RequestLogSerializer,
    ThreadDetailSerializer,
    ThreadSerializer,
)
from providers.services import run_chat
from providers.throttling import ChatRateThrottle

# Длина усечения заголовка треда по первому сообщению — простое усечение,
# без отдельного LLM-вызова на генерацию заголовка (сознательное
# упрощение MVP: дешевле и без доп. списаний кредитов).
THREAD_TITLE_LENGTH = 60


def _chat_outcome_response(outcome):
    """Общий маппинг ChatOutcome.status -> DRF Response для /chat/ и
    /threads/<id>/messages/ — обе точки входа вызывают один и тот же
    providers.services.run_chat и должны одинаково транслировать каждую
    ветку исхода, чтобы фронтенд получал идентичную форму ответа
    независимо от того, персистится сообщение в тред или нет."""
    if outcome.status == "task_locked":
        return Response(
            {
                "detail": "Эта задача ещё не разблокирована на вашем тарифе",
                "code": "task_locked",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if outcome.status == "model_locked":
        return Response(
            {
                "detail": "Эта модель ещё не разблокирована на вашем тарифе",
                "code": "model_locked",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if outcome.status == "insufficient_credits":
        return Response(
            {"detail": "Недостаточно кредитов"},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )
    if outcome.status == "provider_error":
        return Response(
            {"detail": "Ошибка провайдера"}, status=status.HTTP_502_BAD_GATEWAY
        )
    if outcome.status == "blocked":
        return Response(
            {"detail": "Этот промпт заблокирован модерацией"},
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
    return _chat_outcome_response(outcome)


class ThreadPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class ThreadListCreateView(generics.ListCreateAPIView):
    serializer_class = ThreadSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ThreadPagination

    def get_queryset(self):
        return Thread.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ThreadDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ThreadDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Thread.objects.filter(user=self.request.user).prefetch_related(
            "messages"
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatRateThrottle])
def thread_message(request, thread_id):
    thread = get_object_or_404(Thread, pk=thread_id, user=request.user)
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    prompt = serializer.validated_data["prompt"]
    task = serializer.validated_data["task"]

    outcome = run_chat(
        request.user,
        prompt,
        task,
        model=serializer.validated_data.get("model") or None,
    )

    if outcome.status == "ok":
        with transaction.atomic():
            Message.objects.create(thread=thread, role=Message.Role.USER, text=prompt)
            Message.objects.create(
                thread=thread,
                role=Message.Role.ASSISTANT,
                text=outcome.text,
                provider=outcome.provider,
                model=outcome.model,
                mocked=outcome.mocked,
                used_fallback=outcome.used_fallback,
                credits_charged=outcome.credits_charged,
            )
            if not thread.title:
                thread.title = prompt[:THREAD_TITLE_LENGTH]
            thread.save()  # save() всегда бампает auto_now updated_at

    return _chat_outcome_response(outcome)


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
