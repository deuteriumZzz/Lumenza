DEFAULT_MAX_CHARS = 800
DEFAULT_OVERLAP = 100


def chunk_text(
    text: str,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Разбиение текста на фрагменты фиксированного размера с перекрытием
    — сознательно без учёта границ предложений/семантики (v1, дёшево и
    предсказуемо). Возвращает пустой список для пустого текста, а не
    список из одной пустой строки."""
    stripped = text.strip()
    if not stripped:
        return []
    if len(stripped) <= max_chars:
        return [stripped]

    chunks = []
    step = max_chars - overlap
    start = 0
    while start < len(stripped):
        piece = stripped[start : start + max_chars].strip()
        if piece:
            chunks.append(piece)
        start += step
    return chunks
