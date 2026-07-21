import base64
import binascii
import io
import warnings

from PIL import Image, UnidentifiedImageError

from core.validators import MAX_IMAGE_UPLOAD_BYTES

MAX_GENERATED_IMAGE_BYTES = MAX_IMAGE_UPLOAD_BYTES
MAX_GENERATED_IMAGE_PIXELS = 2048 * 2048
MAX_BASE64_IMAGE_CHARS = ((MAX_GENERATED_IMAGE_BYTES + 2) // 3) * 4
ALLOWED_GENERATED_IMAGE_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})


def normalize_generated_image(image_bytes: bytes) -> bytes:
    if not image_bytes or len(image_bytes) > MAX_GENERATED_IMAGE_BYTES:
        raise ValueError("Generated image is empty or too large")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as image:
                if image.format not in ALLOWED_GENERATED_IMAGE_FORMATS:
                    raise ValueError("Generated image format is not allowed")
                width, height = image.size
                if width * height > MAX_GENERATED_IMAGE_PIXELS:
                    raise ValueError(
                        "Generated image dimensions are too large"
                    )
                image.load()
                target_mode = "RGBA" if "A" in image.getbands() else "RGB"
                normalized = image.convert(target_mode)
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as exc:
        raise ValueError("Provider returned invalid image data") from exc

    output = io.BytesIO()
    normalized.save(output, format="PNG")
    normalized_bytes = output.getvalue()
    if len(normalized_bytes) > MAX_GENERATED_IMAGE_BYTES:
        raise ValueError("Normalized image is too large")
    return normalized_bytes


def decode_base64_image(encoded_image: str) -> bytes:
    if len(encoded_image) > MAX_BASE64_IMAGE_CHARS:
        raise ValueError("Encoded image is too large")
    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(
            "Provider returned invalid base64 image data"
        ) from exc
    return normalize_generated_image(image_bytes)
