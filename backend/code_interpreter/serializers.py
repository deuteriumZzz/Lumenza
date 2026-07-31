from rest_framework import serializers

from code_interpreter.models import CodeExecution

# Generous cap for a short script, matching the precedent set by
# knowledge.TextSourceRequestSerializer's 20000-char limit for pasted text.
MAX_CODE_LENGTH = 20000


class CodeExecutionRequestSerializer(serializers.Serializer):
    code = serializers.CharField(
        max_length=MAX_CODE_LENGTH, trim_whitespace=False, allow_blank=False
    )


class CodeExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeExecution
        fields = (
            "id",
            "code",
            "language",
            "version",
            "stdout",
            "stderr",
            "exit_code",
            "status",
            "credits_charged",
            "mocked",
            "created_at",
            "completed_at",
        )
