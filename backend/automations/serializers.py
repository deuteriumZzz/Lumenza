from rest_framework import serializers

from automations.models import (
    PendingAction,
    ScheduledAgentRun,
    TelegramChannel,
)


class TelegramChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelegramChannel
        fields = ("id", "chat_id", "title", "connected_at")


class ConnectTelegramChannelRequestSerializer(serializers.Serializer):
    chat_id = serializers.IntegerField()


class ScheduledAgentRunSerializer(serializers.ModelSerializer):
    agent = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = ScheduledAgentRun
        fields = (
            "id",
            "agent",
            "input_payload",
            "hour",
            "minute",
            "publish_channel",
            "is_active",
            "next_run_at",
            "last_run_at",
            "last_agent_run",
            "created_at",
        )


class CreateScheduleRequestSerializer(serializers.Serializer):
    agent_slug = serializers.CharField()
    input = serializers.DictField(
        child=serializers.CharField(allow_blank=True)
    )
    hour = serializers.IntegerField(min_value=0, max_value=23)
    minute = serializers.IntegerField(min_value=0, max_value=59, default=0)
    channel_id = serializers.IntegerField(
        required=False, allow_null=True, default=None
    )


class UpdateScheduleRequestSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class PendingActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PendingAction
        fields = (
            "id",
            "agent_run",
            "channel",
            "text",
            "status",
            "error_message",
            "created_at",
            "confirmed_at",
            "sent_at",
        )


class RequestPublishRequestSerializer(serializers.Serializer):
    agent_run_id = serializers.IntegerField()
    channel_id = serializers.IntegerField()
    text = serializers.CharField(max_length=8000, allow_blank=False)


class UpdatePendingActionTextSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=8000, allow_blank=False)
