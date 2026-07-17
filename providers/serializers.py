from rest_framework import serializers

from providers.models import RequestLog


class ChatRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(max_length=8000, trim_whitespace=True, allow_blank=False)
    mode = serializers.ChoiceField(choices=["fast", "smart", "cheap"], default="fast")


class RequestLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestLog
        # Deliberately excludes cost_usd (would let a user back out our
        # provider markup ratio from credits_charged) and error_message
        # (internal diagnostic detail, not user-facing).
        fields = (
            "id", "provider", "model", "mode", "status", "credits_charged",
            "latency_ms", "mocked", "used_fallback", "created_at",
        )
