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
    current_requests = serializers.IntegerField()
    target_requests = serializers.IntegerField()
    current_days = serializers.IntegerField()
    target_days = serializers.IntegerField()
