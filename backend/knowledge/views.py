from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.responses import INSUFFICIENT_CREDITS_DETAIL
from knowledge.models import EmbedWidget, Source, Workspace
from knowledge.serializers import (
    EmbedAskRequestSerializer,
    EmbedWidgetSerializer,
    ImageSourceRequestSerializer,
    SearchRequestSerializer,
    SourceSerializer,
    TextSourceRequestSerializer,
    WorkspaceSerializer,
)
from knowledge.services import search as search_workspace
from knowledge.services import start_image_source, start_text_source
from knowledge.throttling import EmbedAskThrottle, KnowledgeRateThrottle


class WorkspaceListCreateView(generics.ListCreateAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class WorkspaceDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(user=self.request.user)


class SourceListView(generics.ListAPIView):
    serializer_class = SourceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Source.objects.filter(
            workspace_id=self.kwargs["workspace_id"],
            workspace__user=self.request.user,
        )


class SourceDetailView(generics.RetrieveAPIView):
    serializer_class = SourceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Source.objects.filter(workspace__user=self.request.user)


def _source_outcome_response(outcome):
    if outcome.status == "not_found":
        return Response(status=status.HTTP_404_NOT_FOUND)
    if outcome.status == "insufficient_credits":
        return Response(
            {"detail": INSUFFICIENT_CREDITS_DETAIL},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )
    if outcome.status == "enqueue_failed":
        return Response(
            {"detail": "Knowledge ingestion is temporarily unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(
        SourceSerializer(outcome.source).data, status=status.HTTP_202_ACCEPTED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([KnowledgeRateThrottle])
def create_text_source(request, workspace_id):
    serializer = TextSourceRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_text_source(
        request.user, workspace_id, serializer.validated_data["text"]
    )
    return _source_outcome_response(outcome)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
@throttle_classes([KnowledgeRateThrottle])
def create_image_source(request, workspace_id):
    serializer = ImageSourceRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    outcome = start_image_source(
        request.user, workspace_id, serializer.validated_data["image"]
    )
    return _source_outcome_response(outcome)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([KnowledgeRateThrottle])
def search_workspace_view(request, workspace_id):
    serializer = SearchRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    results = search_workspace(
        request.user, workspace_id, serializer.validated_data["query"]
    )
    if results is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(
        [
            {"id": chunk.id, "text": chunk.text, "score": score}
            for chunk, score in results
        ]
    )


class EmbedWidgetListCreateView(generics.ListCreateAPIView):
    serializer_class = EmbedWidgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EmbedWidget.objects.filter(
            workspace_id=self.kwargs["workspace_id"],
            workspace__user=self.request.user,
        )

    def perform_create(self, serializer):
        workspace = get_object_or_404(
            Workspace, id=self.kwargs["workspace_id"], user=self.request.user
        )
        serializer.save(workspace=workspace)


class EmbedWidgetDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EmbedWidgetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EmbedWidget.objects.filter(workspace__user=self.request.user)


# Общий словарь для embed_ask_view ниже — сообщения написаны для
# анонимного посетителя чужого сайта, а не для владельца workspace, в
# отличие от providers.views._chat_outcome_response (тот текст типа
# "Недостаточно кредитов" адресован владельцу аккаунта и раскрыл бы
# посетителю биллинг-состояние чужого пользователя).
_EMBED_ASK_ERROR_RESPONSES = {
    "blocked": (
        {"detail": "Не могу ответить на этот вопрос."},
        status.HTTP_422_UNPROCESSABLE_ENTITY,
    ),
    "insufficient_credits": (
        {"detail": "Ассистент временно недоступен."},
        status.HTTP_503_SERVICE_UNAVAILABLE,
    ),
    "provider_error": (
        {"detail": "Ассистент временно недоступен."},
        status.HTTP_503_SERVICE_UNAVAILABLE,
    ),
    "invalid_workspace": (
        {"detail": "Ассистент временно недоступен."},
        status.HTTP_503_SERVICE_UNAVAILABLE,
    ),
}

_EMBED_SYSTEM_PROMPT = (
    "Ты — ассистент, отвечающий на вопросы посетителей сайта на основе "
    "прикреплённой базы знаний. Отвечай кратко и по делу, используя "
    "только контекст из базы знаний. Если в контексте нет ответа на "
    "вопрос, честно скажи, что не знаешь — не выдумывай."
)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([EmbedAskThrottle])
def embed_ask_view(request, public_key):
    from providers.services import run_chat

    widget = EmbedWidget.objects.select_related("workspace__user").filter(
        public_key=public_key, is_active=True
    ).first()
    if widget is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    serializer = EmbedAskRequestSerializer(data=request.GET)
    serializer.is_valid(raise_exception=True)

    outcome = run_chat(
        widget.workspace.user,
        serializer.validated_data["q"],
        system=_EMBED_SYSTEM_PROMPT,
        workspace_id=widget.workspace_id,
    )
    if outcome.status != "ok":
        detail, response_status = _EMBED_ASK_ERROR_RESPONSES.get(
            outcome.status,
            (
                {"detail": "Ассистент временно недоступен."},
                status.HTTP_503_SERVICE_UNAVAILABLE,
            ),
        )
        response = Response(detail, status=response_status)
        response["Access-Control-Allow-Origin"] = "*"
        return response

    response = Response({"answer": outcome.text})
    response["Access-Control-Allow-Origin"] = "*"
    return response
