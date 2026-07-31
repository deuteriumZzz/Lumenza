from django.db.models import Q
from rest_framework import generics, status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from agents.models import Agent, AgentRun
from agents.serializers import (
    AgentDetailSerializer,
    AgentRunRequestSerializer,
    AgentRunSerializer,
    AgentSummarySerializer,
    CustomAgentCreateSerializer,
    CustomAgentSerializer,
)
from agents.services import (
    InvalidAgentInputError,
    create_custom_agent,
    start_agent_run,
)
from core.responses import INSUFFICIENT_CREDITS_DETAIL

# An agent runnable/viewable by the current user: either the shared public
# catalog (user is null) or one of their own "Мои агенты" custom agents.
def _runnable_agents(user):
    return Agent.objects.filter(status=Agent.Status.PUBLISHED).filter(
        Q(user__isnull=True) | Q(user=user)
    )


class AgentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentSummarySerializer
    queryset = Agent.objects.filter(
        status=Agent.Status.PUBLISHED, user__isnull=True
    )


class AgentDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return _runnable_agents(self.request.user)


class CustomAgentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Agent.objects.filter(
            user=self.request.user, status=Agent.Status.PUBLISHED
        ).order_by("-created_at")

    def get_serializer_class(self):
        return (
            CustomAgentCreateSerializer
            if self.request.method == "POST"
            else CustomAgentSerializer
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            agent = create_custom_agent(
                request.user,
                serializer.validated_data["name"],
                serializer.validated_data["description"],
                serializer.validated_data["agent_slugs"],
            )
        except InvalidAgentInputError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            CustomAgentSerializer(agent).data, status=status.HTTP_201_CREATED
        )


class CustomAgentDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CustomAgentSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return Agent.objects.filter(user=self.request.user)

    def patch(self, request, *args, **kwargs):
        if request.data.keys() != {"status"} or request.data.get(
            "status"
        ) != Agent.Status.ARCHIVED:
            return Response(
                {"detail": "Only archiving is supported"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        agent = self.get_object()
        agent.status = Agent.Status.ARCHIVED
        agent.save(update_fields=["status"])
        return Response(CustomAgentSerializer(agent).data)


class AgentRunCreateView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentRunRequestSerializer

    def create(self, request, *args, **kwargs):
        agent = get_object_or_404(
            _runnable_agents(request.user), slug=kwargs["slug"]
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outcome = start_agent_run(
            request.user,
            agent,
            serializer.validated_data["input"],
            serializer.validated_data["idempotency_key"],
            workspace_id=serializer.validated_data.get("workspace_id"),
        )

        if outcome.status == "invalid_input":
            return Response(
                {"detail": outcome.error_message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if outcome.status == "insufficient_credits":
            return Response(
                {"detail": INSUFFICIENT_CREDITS_DETAIL},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        if outcome.status == "enqueue_failed":
            return Response(
                {"detail": "Agent runs are temporarily unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        output = AgentRunSerializer(outcome.run)
        response_status = (
            status.HTTP_200_OK
            if outcome.status == "existing"
            else status.HTTP_202_ACCEPTED
        )
        return Response(output.data, status=response_status)


class AgentRunDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentRunSerializer

    def get_queryset(self):
        return AgentRun.objects.filter(user=self.request.user)
