from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
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

from billing.models import LedgerEntry
from imagegen.models import GeneratedImage
from media_ops.constants import GEMINI_LIVE_MODEL, LIVE_VOICE_PROVIDER
from media_ops.models import (
    DocumentExtraction,
    PhotoAnalysis,
    SpeechClip,
    Transcription,
)
from providers.models import Message, Preset, RequestLog, Thread
from providers.serializers import (
    ChatRequestSerializer,
    HistoryFilterSerializer,
    PresetSerializer,
    RequestLogSerializer,
    ThreadDetailSerializer,
    ThreadSerializer,
)
from providers.services import run_chat, start_chat_stream
from providers.throttling import ChatRateThrottle

# Верхняя граница суммарного времени ожидания в цикле опроса ниже — если
# generation так и не дошла до done/error за это время (застрявший/упавший
# celery-воркер, единственный сценарий без явной очистки в этой версии),
# соединение закрывается с явной ошибкой вместо зависания навечно.
MAX_STREAM_WAIT_SECONDS = 90
STREAM_POLL_INTERVAL_SECONDS = 0.2

# Длина усечения заголовка треда по первому сообщению — простое усечение,
# без отдельного LLM-вызова на генерацию заголовка (сознательное
# упрощение MVP: дешевле и без доп. списаний кредитов).
THREAD_TITLE_LENGTH = 60


STUDIO_USAGE_MODELS = (
    GeneratedImage,
    Transcription,
    SpeechClip,
    DocumentExtraction,
    PhotoAnalysis,
)


def _merge_usage_row(grouped, row):
    key = (row["provider"], row["model"])
    current = grouped.setdefault(
        key,
        {
            "provider": row["provider"],
            "model": row["model"],
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "credits_charged": Decimal("0"),
            "requests": 0,
        },
    )
    current["prompt_tokens"] += row.get("prompt_tokens") or 0
    current["completion_tokens"] += row.get("completion_tokens") or 0
    current["credits_charged"] += row["credits_charged"] or Decimal("0")
    current["requests"] += row["requests"]


def _serialize_usage_row(row):
    return {
        "provider": row["provider"],
        "model": row["model"],
        "prompt_tokens": row["prompt_tokens"],
        "completion_tokens": row["completion_tokens"],
        "total_tokens": row["prompt_tokens"] + row["completion_tokens"],
        "credits_charged": f"{row['credits_charged']:.4f}",
        "requests": row["requests"],
    }


def _chat_outcome_response(outcome):
    """Общий маппинг ChatOutcome.status -> DRF Response для /chat/ и
    /threads/<id>/messages/ — обе точки входа вызывают один и тот же
    providers.services.run_chat и должны одинаково транслировать каждую
    ветку исхода, чтобы фронтенд получал идентичную форму ответа
    независимо от того, персистится сообщение в тред или нет."""
    if outcome.status == "invalid_model":
        return Response(
            {
                "detail": "Выбранная модель не поддерживается для этой задачи",
                "code": "invalid_model",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if outcome.status == "invalid_workspace":
        return Response(
            {
                "detail": "База знаний не найдена",
                "code": "invalid_workspace",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if outcome.status == "model_requires_pro":
        return Response(
            {
                "detail": "Эта premium-модель доступна в тарифе Pro",
                "code": "model_requires_pro",
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
            "task": outcome.task,
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
        task=serializer.validated_data.get("task") or None,
        model=serializer.validated_data.get("model") or None,
        system=serializer.validated_data.get("system") or None,
        temperature=serializer.validated_data.get("temperature"),
        workspace_id=serializer.validated_data.get("workspace_id"),
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


class PresetListCreateView(generics.ListCreateAPIView):
    serializer_class = PresetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Preset.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PresetDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PresetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Preset.objects.filter(user=self.request.user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatRateThrottle])
def thread_message(request, thread_id):
    thread = get_object_or_404(Thread, pk=thread_id, user=request.user)
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    prompt = serializer.validated_data["prompt"]

    outcome = run_chat(
        request.user,
        prompt,
        task=serializer.validated_data.get("task") or None,
        model=serializer.validated_data.get("model") or None,
        system=serializer.validated_data.get("system") or None,
        temperature=serializer.validated_data.get("temperature"),
        workspace_id=serializer.validated_data.get("workspace_id"),
    )

    if outcome.status == "ok":
        with transaction.atomic():
            Message.objects.create(
                thread=thread, role=Message.Role.USER, text=prompt
            )
            Message.objects.create(
                thread=thread,
                role=Message.Role.ASSISTANT,
                text=outcome.text,
                provider=outcome.provider,
                model=outcome.model,
                task=outcome.task or "",
                mocked=outcome.mocked,
                used_fallback=outcome.used_fallback,
                credits_charged=outcome.credits_charged,
            )
            if not thread.title:
                thread.title = prompt[:THREAD_TITLE_LENGTH]
            thread.save()  # save() всегда бампает auto_now updated_at

    return _chat_outcome_response(outcome)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ChatRateThrottle])
def thread_message_stream(request, thread_id):
    """Starts a streamed generation. Does the same synchronous pre-flight
    as thread_message() (routing/RAG/moderation/credit hold) so a
    rejection is returned immediately, exactly like the non-streaming
    endpoint — only success hands off to a Celery task and returns a
    generation_id for the client to open an SSE connection against (see
    thread_message_stream_events below)."""
    thread = get_object_or_404(Thread, pk=thread_id, user=request.user)
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    prompt = serializer.validated_data["prompt"]

    outcome = start_chat_stream(
        request.user,
        prompt,
        task=serializer.validated_data.get("task") or None,
        model=serializer.validated_data.get("model") or None,
        system=serializer.validated_data.get("system") or None,
        temperature=serializer.validated_data.get("temperature"),
        workspace_id=serializer.validated_data.get("workspace_id"),
        thread_id=thread.id,
    )

    if outcome.status != "accepted":
        return _chat_outcome_response(outcome.rejection)

    return Response(
        {"generation_id": outcome.generation_id},
        status=status.HTTP_202_ACCEPTED,
    )


def _sse_event(payload: dict) -> str:
    import json

    return f"data: {json.dumps(payload)}\n\n"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def thread_message_stream_events(request, thread_id, generation_id):
    """SSE tail of a generation buffer (providers/streaming.py). No
    CHANNEL_LAYERS/pub-sub is configured in this project, so this polls
    the (Redis-backed) cache instead of a true push — the buffer stores
    cumulative text, so a (re)connecting client always gets sent whatever
    has been generated so far as its very first event, which is what
    makes this resumable: reconnect to the same generation_id from
    anywhere and pick up exactly where the buffer is."""
    import time

    from django.http import StreamingHttpResponse

    from providers.streaming import get_snapshot

    thread = get_object_or_404(Thread, pk=thread_id, user=request.user)
    snapshot = get_snapshot(generation_id)
    if (
        snapshot is None
        or snapshot.get("thread_id") != thread.id
        or snapshot.get("user_id") != request.user.id
    ):
        return Response(status=status.HTTP_404_NOT_FOUND)

    def event_stream():
        last_sent_text = None
        waited = 0.0
        while True:
            current = get_snapshot(generation_id)
            if current is None:
                yield _sse_event({"type": "error", "code": "expired"})
                return
            if current["text"] != last_sent_text:
                last_sent_text = current["text"]
                yield _sse_event({"type": "chunk", "text": last_sent_text})
            if current["status"] == "done":
                yield _sse_event({"type": "done", **current["payload"]})
                return
            if current["status"] == "error":
                yield _sse_event({"type": "error", **current["error"]})
                return
            if waited >= MAX_STREAM_WAIT_SECONDS:
                yield _sse_event({"type": "error", "code": "stalled"})
                return
            time.sleep(STREAM_POLL_INTERVAL_SECONDS)
            waited += STREAM_POLL_INTERVAL_SECONDS

    response = StreamingHttpResponse(
        event_stream(), content_type="text/event-stream"
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def usage_summary(request):
    grouped = {}
    chat_rows = (
        RequestLog.objects.filter(
            user=request.user,
            status=RequestLog.Status.OK,
        )
        .values("provider", "model")
        .annotate(
            prompt_tokens=Sum("prompt_tokens"),
            completion_tokens=Sum("completion_tokens"),
            credits_charged=Sum("credits_charged"),
            requests=Count("id"),
        )
    )
    for row in chat_rows:
        _merge_usage_row(grouped, row)

    for usage_model in STUDIO_USAGE_MODELS:
        studio_rows = (
            usage_model.objects.filter(
                user=request.user,
                status=usage_model.Status.OK,
            )
            .values("provider", "model")
            .annotate(
                credits_charged=Sum("credits_charged"),
                requests=Count("id"),
            )
        )
        for row in studio_rows:
            _merge_usage_row(grouped, row)

    live_voice = LedgerEntry.objects.filter(
        account__user=request.user,
        reason=LedgerEntry.Reason.LIVE_VOICE_SESSION,
        amount__lt=0,
    ).aggregate(
        credits_spent=Sum("amount"),
        requests=Count("id"),
    )
    if live_voice["requests"]:
        _merge_usage_row(
            grouped,
            {
                "provider": LIVE_VOICE_PROVIDER,
                "model": GEMINI_LIVE_MODEL,
                "credits_charged": -live_voice["credits_spent"],
                "requests": live_voice["requests"],
            },
        )

    by_model = sorted(
        (_serialize_usage_row(row) for row in grouped.values()),
        key=lambda row: (
            -row["total_tokens"],
            -Decimal(row["credits_charged"]),
            row["provider"],
            row["model"],
        ),
    )
    prompt_tokens = sum(row["prompt_tokens"] for row in grouped.values())
    completion_tokens = sum(
        row["completion_tokens"] for row in grouped.values()
    )
    credits_charged = sum(
        (row["credits_charged"] for row in grouped.values()),
        start=Decimal("0"),
    )
    requests = sum(row["requests"] for row in grouped.values())

    return Response(
        {
            "total": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "credits_charged": f"{credits_charged:.4f}",
                "requests": requests,
            },
            "by_model": by_model,
        }
    )
