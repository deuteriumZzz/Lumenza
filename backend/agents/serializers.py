from rest_framework import serializers

from agents.models import Agent, AgentRun, SwarmRun


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
            "source_agent_slugs",
        )


class CustomAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agent
        fields = (
            "slug",
            "name",
            "description",
            "category",
            "status",
            "source_agent_slugs",
            "created_at",
        )


class CustomAgentCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=500, allow_blank=True)
    agent_slugs = serializers.ListField(
        child=serializers.CharField(), min_length=2, max_length=3
    )


class AgentRunRequestSerializer(serializers.Serializer):
    input = serializers.DictField(
        child=serializers.CharField(allow_blank=True)
    )
    idempotency_key = serializers.CharField(max_length=64, allow_blank=False)
    # Необязательное вложение knowledge.Workspace (RAG) — владение
    # проверяется в agents.services.start_agent_run.
    workspace_id = serializers.IntegerField(
        required=False, allow_null=True, default=None
    )
    preferred_model = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class AgentRunSerializer(serializers.ModelSerializer):
    agent = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = AgentRun
        fields = (
            "id",
            "agent",
            "agent_version",
            "status",
            "preferred_model",
            "steps",
            "result",
            "credits_charged",
            "error_message",
            "created_at",
            "completed_at",
        )


class SwarmRunRequestSerializer(serializers.Serializer):
    agent_slug = serializers.CharField(max_length=64)
    inputs = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField(allow_blank=True)
        ),
        min_length=2,
        max_length=5,
    )


class SwarmChildRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentRun
        fields = ("id", "input_payload", "status", "result")


class SwarmRunSerializer(serializers.ModelSerializer):
    agent = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    children = SwarmChildRunSerializer(
        source="child_runs", many=True, read_only=True
    )

    class Meta:
        model = SwarmRun
        fields = (
            "id",
            "agent",
            "inputs",
            "status",
            "result",
            "credits_charged",
            "error_message",
            "children",
            "created_at",
            "completed_at",
        )
