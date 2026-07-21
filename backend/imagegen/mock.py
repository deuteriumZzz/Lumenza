import hashlib
import io

from PIL import Image, ImageDraw


def mock_image_bytes(prompt: str, size: tuple[int, int] = (512, 512)) -> bytes:
    """Детерминированная PNG-заглушка, чтобы моковые записи в галерее визуально
    отличались друг от друга по промпту, а не были одинаковым пустым
    квадратом."""
    digest = hashlib.sha256(prompt.encode()).digest()
    color = (digest[0], digest[1], digest[2])
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    label = f"[mock] {prompt[:40]}"
    draw.text((16, 16), label, fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
