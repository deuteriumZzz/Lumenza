from rest_framework import serializers

from providers.models import Message, Preset, RequestLog, Thread

CHAT_TASK_CHOICES = (
    "hook",
    "longform",
    "hashtags",
    "content_plan",
    "repurpose",
    "translation",
    "search",
)


class ChatRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(
        max_length=8000, trim_whitespace=True, allow_blank=False
    )
    # Отсутствие/пустая строка означает "определи сам" — веб-чат больше не
    # заставляет выбирать тему вручную, providers.services.run_chat
    # классифицирует промпт, если task не передан (см. providers/intent.py).
    task = serializers.ChoiceField(
        choices=CHAT_TASK_CHOICES,
        required=False,
        allow_blank=True,
        allow_null=True,
        default=None,
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
    # Оба новых поля — сквозной проброс до providers.services.run_chat,
    # который решает, что с ними делать (никакой бизнес-логики здесь).
    # Пусто/не передано ведёт себя ровно как раньше (фиксировано
    # регрессионным тестом).
    system = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default=None,
        max_length=4000,
    )
    temperature = serializers.FloatField(
        required=False,
        allow_null=True,
        default=None,
        min_value=0,
        max_value=2,
    )
    # Необязательное вложение knowledge.Workspace — сквозной проброс до
    # providers.services.run_chat, которая проверяет владение и достаёт
    # релевантные чанки (см. knowledge.services.search).
    workspace_id = serializers.IntegerField(
        required=False, allow_null=True, default=None
    )


class HistoryFilterSerializer(serializers.Serializer):
    task = serializers.ChoiceField(
        choices=CHAT_TASK_CHOICES, required=False
    )
    provider = serializers.RegexField(
        r"^[a-z0-9_-]+$", max_length=32, required=False
    )
    status = serializers.ChoiceField(
        choices=RequestLog.Status.values, required=False
    )
    created_after = serializers.DateTimeField(required=False)
    created_before = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        created_after = attrs.get("created_after")
        created_before = attrs.get("created_before")
        if (
            created_after is not None
            and created_before is not None
            and created_after >= created_before
        ):
            raise serializers.ValidationError(
                "created_after must be earlier than created_before"
            )
        return attrs


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


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = (
            "id",
            "role",
            "text",
            "provider",
            "model",
            "task",
            "mocked",
            "used_fallback",
            "credits_charged",
            "created_at",
        )


class ThreadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thread
        fields = ("id", "title", "created_at", "updated_at")


class ThreadDetailSerializer(ThreadSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ThreadSerializer.Meta):
        fields = ThreadSerializer.Meta.fields + ("messages",)


class PresetSerializer(serializers.ModelSerializer):
    # Та же валидация задачи, что и у ChatRequestSerializer.task — не
    # дублирует список, ссылается на тот же тьюпл. `model` намеренно НЕ
    # проверяется по списку допустимых значений на этом уровне (как и в
    # ChatRequestSerializer) — реальная проверка (в том числе доступность
    # по тарифу) происходит в run_chat() в момент отправки, а не в момент
    # сохранения пресета.
    task = serializers.ChoiceField(choices=CHAT_TASK_CHOICES)
    # HiddenField, а не просто передача user= в perform_create — без
    # этого DRF не может собрать автоматический UniqueTogetherValidator
    # для (user, name) (полю user неоткуда взяться из тела запроса), и
    # дубликат имени падал бы 500-й IntegrityError с БД вместо чистого
    # 400 от валидатора.
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Preset
        fields = (
            "id",
            "user",
            "name",
            "model",
            "task",
            "system_prompt",
            "temperature",
            "created_at",
            "updated_at",
        )
