from functools import partial
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from accounts.models import UserContext

User = get_user_model()

MAX_PET_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PET_REQUEST_BYTES = MAX_PET_IMAGE_BYTES + 64 * 1024
SUPPORTED_PET_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
SUPPORTED_PET_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
PET_CONTENT_TYPE_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
PET_EXTENSIONS_BY_FORMAT = {
    "JPEG": {".jpg", ".jpeg"},
    "PNG": {".png"},
    "WEBP": {".webp"},
}
MAX_PET_IMAGE_DIMENSION = 4096
MAX_PET_IMAGE_PIXELS = 16_000_000


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
    # Раскрывает только факт привязки, не сам telegram_id — фронтенду
    # достаточно знать "привязан/не привязан", чтобы показать статус на
    # /pricing, а не сам числовой Telegram ID пользователя.
    telegram_linked = serializers.SerializerMethodField()
    pet_image = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "telegram_linked",
            "tier",
            "pet_name",
            "pet_image",
            "pet_preset",
            "show_pet",
        )

    def get_telegram_linked(self, obj) -> bool:
        return obj.telegram_id is not None

    def get_pet_image(self, obj):
        if not obj.pet_image:
            return None
        # Keep this stable across login/me/pet responses. The frontend already
        # resolves relative API media paths and must not depend on the request
        # host.
        return obj.pet_image.url


class PetImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if getattr(data, "size", 0) > MAX_PET_IMAGE_BYTES:
            raise serializers.ValidationError(
                "Изображение питомца не должно превышать 5 МБ."
            )
        declared_content_type = (
            getattr(data, "content_type", "") or ""
        ).lower()
        if declared_content_type not in SUPPORTED_PET_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Поддерживаются только изображения JPEG, PNG и WebP."
            )

        image = super().to_internal_value(data)
        decoded_content_type = (
            getattr(image, "content_type", "") or ""
        ).lower()
        if decoded_content_type != declared_content_type:
            raise serializers.ValidationError(
                "MIME-тип не соответствует содержимому изображения."
            )
        return image


class UserPetSerializer(serializers.ModelSerializer):
    pet_image = PetImageField(
        required=False,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = ("pet_name", "pet_image", "pet_preset", "show_pet")
        extra_kwargs = {
            "pet_name": {"required": False, "allow_blank": True},
            "pet_preset": {"required": False, "allow_blank": True},
            "show_pet": {"required": False},
        }

    def validate_pet_image(self, value):
        if value is None:
            return value
        if value.size > MAX_PET_IMAGE_BYTES:
            raise serializers.ValidationError(
                "Изображение питомца не должно превышать 5 МБ."
            )

        content_type = (getattr(value, "content_type", "") or "").lower()
        if content_type not in SUPPORTED_PET_CONTENT_TYPES:
            raise serializers.ValidationError(
                "Поддерживаются только изображения JPEG, PNG и WebP."
            )

        try:
            value.seek(0)
            with Image.open(value) as image:
                decoded_format = image.format
                width, height = image.size
                if (
                    width > MAX_PET_IMAGE_DIMENSION
                    or height > MAX_PET_IMAGE_DIMENSION
                    or width * height > MAX_PET_IMAGE_PIXELS
                ):
                    raise serializers.ValidationError(
                        "Изображение питомца не должно превышать "
                        "4096 × 4096 пикселей и 16 мегапикселей."
                    )
                image.verify()
        except (
            OSError,
            UnidentifiedImageError,
            Image.DecompressionBombError,
        ) as exc:
            raise serializers.ValidationError(
                "Не удалось прочитать изображение питомца."
            ) from exc
        finally:
            value.seek(0)

        if decoded_format not in SUPPORTED_PET_IMAGE_FORMATS:
            raise serializers.ValidationError(
                "Поддерживаются только изображения JPEG, PNG и WebP."
            )
        if PET_CONTENT_TYPE_BY_FORMAT[decoded_format] != content_type:
            raise serializers.ValidationError(
                "MIME-тип не соответствует содержимому изображения."
            )
        suffix = Path(value.name).suffix.lower()
        if suffix not in PET_EXTENSIONS_BY_FORMAT[decoded_format]:
            raise serializers.ValidationError(
                "Расширение файла не соответствует формату изображения."
            )
        return value

    def update(self, instance, validated_data):
        old_name = instance.pet_image.name if instance.pet_image else ""
        old_storage = (
            instance.pet_image.storage if instance.pet_image else None
        )

        # A custom upload and a built-in preset are mutually exclusive —
        # picking one clears the other so the profile UI never has to
        # decide which "wins" when both are present.
        if validated_data.get("pet_preset"):
            validated_data["pet_image"] = None
        elif validated_data.get("pet_image") is not None:
            validated_data["pet_preset"] = ""

        image_is_updated = "pet_image" in validated_data

        updated_user = super().update(instance, validated_data)

        new_name = (
            updated_user.pet_image.name if updated_user.pet_image else ""
        )
        if image_is_updated and old_name and old_name != new_name:
            transaction.on_commit(
                partial(old_storage.delete, old_name),
                robust=True,
            )
        return updated_user


class UserContextSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserContext
        fields = ("data",)
