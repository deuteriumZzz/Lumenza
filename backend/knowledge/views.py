from rest_framework import generics, status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.responses import INSUFFICIENT_CREDITS_DETAIL
from knowledge.models import Source, Workspace
from knowledge.serializers import (
    ImageSourceRequestSerializer,
    SearchRequestSerializer,
    SourceSerializer,
    TextSourceRequestSerializer,
    WorkspaceSerializer,
)
from knowledge.services import search as search_workspace
from knowledge.services import start_image_source, start_text_source
from knowledge.throttling import KnowledgeRateThrottle


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
