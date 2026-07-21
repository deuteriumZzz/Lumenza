from rest_framework import serializers

from providers.models import RequestLog


class ChatRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=8000, trim_whitespace=True, allow_blank=False
    )
    task = serializers.ChoiceField(
        choices=[
            "hook",
            "longform",
            "hashtags",
            "content_plan",
            "repurpose",
            "translation",
        ],
        default="repurpose",
    )
    # Необязательный явный выбор модели (геймифицированная разблокировка
    # на ступень ниже категории задачи) — здесь не проверяется по
    # фиксированному списку допустимых значений, так как допустимые
    # значения зависят от `task`; реальную проверку делает
    # providers.services.run_chat (неизвестная/заблокированная модель ->
    # status="model_locked").
    model = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )


class RequestLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestLog
        # Намеренно исключены cost_usd (позволило бы пользователю
        # вычислить нашу наценку по отношению credits_charged к
        # себестоимости) и error_message (внутренняя диагностика, не для
        # пользователя).
        fields = (
            "id",
            "provider",
            "model",
            "task",
            "status",
            "credits_charged",
            "latency_ms",
            "mocked",
            "used_fallback",
            "created_at",
        )
