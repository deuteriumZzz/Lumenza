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
)
from agents.services import start_agent_run
from core.responses import INSUFFICIENT_CREDITS_DETAIL


class AgentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentSummarySerializer
    queryset = Agent.objects.filter(status=Agent.Status.PUBLISHED)


class AgentDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentDetailSerializer
    queryset = Agent.objects.filter(status=Agent.Status.PUBLISHED)
    lookup_field = "slug"


class AgentRunCreateView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentRunRequestSerializer

    def create(self, request, *args, **kwargs):
        agent = get_object_or_404(
            Agent, slug=kwargs["slug"], status=Agent.Status.PUBLISHED
        )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outcome = start_agent_run(
            request.user,
            agent,
            serializer.validated_data["input"],
            serializer.validated_data["idempotency_key"],
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
