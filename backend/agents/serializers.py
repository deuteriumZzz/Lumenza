from rest_framework import serializers

from agents.models import Agent, AgentRun


class AgentSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = ("slug", "name", "description", "category")


class AgentDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = (
            "slug",
            "name",
            "description",
            "category",
            "version",
            "input_schema",
            "output_schema",
        )


class AgentRunRequestSerializer(serializers.Serializer):
    input = serializers.DictField(
        child=serializers.CharField(allow_blank=True)
    )
    idempotency_key = serializers.CharField(max_length=64, allow_blank=False)


class AgentRunSerializer(serializers.ModelSerializer):
    agent = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = AgentRun
        fields = (
            "id",
            "agent",
            "agent_version",
            "status",
            "steps",
            "result",
            "credits_charged",
            "error_message",
            "created_at",
            "completed_at",
        )
