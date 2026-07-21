from django.core.exceptions import ValidationError
from django.template.defaultfilters import filesizeformat

# Эндпоинты загрузки медиа (media_ops, редактирование изображений в
# imagegen) проксируют сырой файл прямиком в адаптер NVIDIA без
# собственного ограничения — неограниченный FileField/ImageField
# позволяет одному запросу занимать воркера (и его память/диск)
# произвольно большой загрузкой ещё до того, как вообще начнётся вызов
# провайдера. Лимиты ниже щедрые для реального случая использования
# (голосовая заметка, отсканированный документ/фото), но всё же
# ограничивают один запрос.
MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024


def max_upload_size(max_bytes: int):
    def validate(file) -> None:
        if file.size > max_bytes:
            raise ValidationError(
                f"File too large ({filesizeformat(file.size)}). "
                f"Max size is {filesizeformat(max_bytes)}."
            )

    return validate
