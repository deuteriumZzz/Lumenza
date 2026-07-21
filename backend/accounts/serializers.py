from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    # Необязательный веб-эквивалент deep-ссылки бота /start ref_<id>
    # (например, query-параметр ?ref=ref_42 на странице регистрации).
    # Не поле модели User, поэтому вынимается в create() перед
    # create_user().
    referral_code = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "referral_code")

    def validate_password(self, value):
        user = User(
            username=self.initial_data.get("username"),
            email=self.initial_data.get("email"),
        )
        try:
            validate_password(value, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value

    def create(self, validated_data):
        validated_data.pop("referral_code", None)
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")
