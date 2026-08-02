import hashlib
import io

from PIL import Image, ImageDraw

# Нет лёгкого чисто-питоновского энкодера MP4, а добавлять ffmpeg как
# системную зависимость только ради заглушки непропорционально —
# используем анимированный GIF (PIL умеет это без внешних зависимостей),
# тот же детерминированный по sha256(prompt) принцип, что и у
# imagegen.mock.mock_image_bytes. GeneratedVideo.mocked отличает этот
# случай, чтобы фронтенд рендерил <img> вместо <video> для заглушек.
_FRAME_COUNT = 4


def mock_video_bytes(prompt: str, size: tuple[int, int] = (512, 512)) -> bytes:
    digest = hashlib.sha256(prompt.encode()).digest()
    base_color = (digest[0], digest[1], digest[2])
    frames = []
    for index in range(_FRAME_COUNT):
        shift = int(255 * index / _FRAME_COUNT)
        color = tuple(min(255, channel + shift) for channel in base_color)
        frame = Image.new("RGB", size, color)
        draw = ImageDraw.Draw(frame)
        draw.text((16, 16), f"[mock video] {prompt[:32]}", fill=(255, 255, 255))
        frames.append(frame)

    buffer = io.BytesIO()
    frames[0].save(
        buffer,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=250,
        loop=0,
    )
    return buffer.getvalue()
