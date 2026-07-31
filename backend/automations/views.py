from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from agents.models import Agent, AgentRun
from agents.services import InvalidAgentInputError
from automations.models import (
    PendingAction,
    ScheduledAgentRun,
    TelegramChannel,
)
from automations.serializers import (
    ConnectTelegramChannelRequestSerializer,
    CreateScheduleRequestSerializer,
    PendingActionSerializer,
    RequestPublishRequestSerializer,
    ScheduledAgentRunSerializer,
    TelegramChannelSerializer,
    UpdatePendingActionTextSerializer,
    UpdateScheduleRequestSerializer,
)
from automations.services import (
    cancel_pending_action,
    confirm_pending_action,
    connect_telegram_channel,
    create_schedule,
    request_publish,
)
from automations.telegram_client import TelegramApiError


class TelegramChannelListCreateView(generics.ListCreateAPIView):
    serializer_class = TelegramChannelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TelegramChannel.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = ConnectTelegramChannelRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            channel = connect_telegram_channel(
                request.user, serializer.validated_data["chat_id"]
            )
        except TelegramApiError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            TelegramChannelSerializer(channel).data,
            status=status.HTTP_201_CREATED,
        )


class TelegramChannelDetailView(generics.DestroyAPIView):
    serializer_class = TelegramChannelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TelegramChannel.objects.filter(user=self.request.user)


class ScheduledAgentRunListCreateView(generics.ListCreateAPIView):
    serializer_class = ScheduledAgentRunSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ScheduledAgentRun.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = CreateScheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        agent = get_object_or_404(
            Agent, slug=data["agent_slug"], status=Agent.Status.PUBLISHED
        )
        channel = None
        if data["channel_id"] is not None:
            channel = get_object_or_404(
                TelegramChannel, id=data["channel_id"], user=request.user
            )

        try:
            schedule = create_schedule(
                request.user,
                agent,
                data["input"],
                data["hour"],
                data["minute"],
                publish_channel=channel,
            )
        except InvalidAgentInputError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            ScheduledAgentRunSerializer(schedule).data,
            status=status.HTTP_201_CREATED,
        )


class ScheduledAgentRunDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ScheduledAgentRunSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return ScheduledAgentRun.objects.filter(user=self.request.user)

    def patch(self, request, *args, **kwargs):
        serializer = UpdateScheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        schedule = self.get_object()
        schedule.is_active = serializer.validated_data["is_active"]
        schedule.save(update_fields=["is_active"])
        return Response(ScheduledAgentRunSerializer(schedule).data)


class PendingActionListCreateView(generics.ListCreateAPIView):
    serializer_class = PendingActionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PendingAction.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = RequestPublishRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        agent_run = get_object_or_404(
            AgentRun, id=data["agent_run_id"], user=request.user
        )
        channel = get_object_or_404(
            TelegramChannel, id=data["channel_id"], user=request.user
        )
        pending_action = request_publish(
            request.user, agent_run, channel, data["text"]
        )
        return Response(
            PendingActionSerializer(pending_action).data,
            status=status.HTTP_201_CREATED,
        )


class PendingActionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = PendingActionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return PendingAction.objects.filter(user=self.request.user)

    def patch(self, request, *args, **kwargs):
        pending_action = self.get_object()
        if pending_action.status != PendingAction.Status.PENDING_CONFIRMATION:
            return Response(
                {"detail": "Only pending drafts can be edited"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = UpdatePendingActionTextSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pending_action.text = serializer.validated_data["text"]
        pending_action.save(update_fields=["text"])
        return Response(PendingActionSerializer(pending_action).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_pending_action_view(request, pk):
    pending_action = get_object_or_404(
        PendingAction,
        id=pk,
        user=request.user,
        status=PendingAction.Status.PENDING_CONFIRMATION,
    )
    confirm_pending_action(pending_action)
    pending_action.refresh_from_db()
    return Response(PendingActionSerializer(pending_action).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_pending_action_view(request, pk):
    pending_action = get_object_or_404(
        PendingAction,
        id=pk,
        user=request.user,
        status=PendingAction.Status.PENDING_CONFIRMATION,
    )
    cancel_pending_action(pending_action)
    pending_action.refresh_from_db()
    return Response(PendingActionSerializer(pending_action).data)
