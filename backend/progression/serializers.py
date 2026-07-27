from rest_framework import serializers


class ResourceProgressSerializer(serializers.Serializer):
    key = serializers.CharField()
    current_requests = serializers.IntegerField()
    target_requests = serializers.IntegerField()
    current_days = serializers.IntegerField()
    target_days = serializers.IntegerField()


class ModelProgressSerializer(serializers.Serializer):
    task = serializers.CharField()
    provider = serializers.CharField()
    model = serializers.CharField()
    unlocked = serializers.BooleanField()
    access_class = serializers.ChoiceField(choices=["standard", "premium"])
    current_requests = serializers.IntegerField()
    target_requests = serializers.IntegerField()
    current_days = serializers.IntegerField()
    target_days = serializers.IntegerField()
