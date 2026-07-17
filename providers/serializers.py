from rest_framework import serializers


class ChatRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(max_length=8000, trim_whitespace=True, allow_blank=False)
    mode = serializers.ChoiceField(choices=["fast", "smart", "cheap"], default="fast")
