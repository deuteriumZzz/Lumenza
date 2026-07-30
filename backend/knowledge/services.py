from dataclasses import dataclass
from typing import Literal, Optional

from django.db import transaction

from billing.models import LedgerEntry
from billing.services import (
    InsufficientCreditsError,
    charge_credits,
    get_or_create_account,
    usd_to_credits,
)
from core.enqueue import try_enqueue_or_refund
from knowledge.embedding_adapter import NvidiaEmbeddingAdapter
from knowledge.models import Chunk, Source, Workspace
from knowledge.pricing import estimate_embedding_cost_usd
from knowledge.tasks import ingest_source_task

# Одна модель эмбеддингов на весь пайплайн, как и у остальных модальностей
# в этом проекте (media_ops.services.*_ROUTES) — куратор добавит второго
# кандидата явным изменением этой константы, а не автоматическим перебором.
EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b"
EMBEDDING_PROVIDER = "nvidia"

# Реальное число чанков неизвестно до самого разбиения текста в задаче
# (зависит от длины текста/OCR-результата) — здесь достаточно
# консервативной оценки на несколько чанков для холда кредитов до
# постановки в очередь, той же логики, что providers.services уже
# использует для оценки холда чат-запроса до вызова провайдера.
_ESTIMATED_CHUNKS_FOR_HOLD = 5


@dataclass
class StartSourceOutcome:
    status: Literal[
        "accepted", "insufficient_credits", "enqueue_failed", "not_found"
    ]
    source: Optional[Source] = None


def _start_source(user, workspace_id: int, **fields) -> StartSourceOutcome:
    workspace = Workspace.objects.filter(id=workspace_id, user=user).first()
    if workspace is None:
        return StartSourceOutcome(status="not_found")

    get_or_create_account(user)
    hold_credits = usd_to_credits(
        estimate_embedding_cost_usd(
            EMBEDDING_MODEL, _ESTIMATED_CHUNKS_FOR_HOLD
        )
    )

    try:
        with transaction.atomic():
            charge_credits(
                user,
                hold_credits,
                reason=LedgerEntry.Reason.KNOWLEDGE_INGEST_REQUEST,
            )
            source = Source.objects.create(
                workspace=workspace,
                user=user,
                provider=EMBEDDING_PROVIDER,
                model=EMBEDDING_MODEL,
                credits_charged=hold_credits,
                **fields,
            )
    except InsufficientCreditsError:
        return StartSourceOutcome(status="insufficient_credits")

    if not try_enqueue_or_refund(
        ingest_source_task,
        source,
        user,
        hold_credits,
        "Failed to enqueue processing",
    ):
        return StartSourceOutcome(status="enqueue_failed", source=source)

    return StartSourceOutcome(status="accepted", source=source)


def start_text_source(
    user, workspace_id: int, text: str
) -> StartSourceOutcome:
    return _start_source(
        user, workspace_id, kind=Source.Kind.TEXT, raw_text=text
    )


def start_image_source(
    user, workspace_id: int, image_file
) -> StartSourceOutcome:
    return _start_source(
        user, workspace_id, kind=Source.Kind.IMAGE, image=image_file
    )


def search(
    user, workspace_id: int, query: str, top_k: int = 5
) -> Optional[list[tuple[Chunk, float]]]:
    """Возвращает топ-k чанков workspace по косинусному сходству с
    query, отсортированные по убыванию похожести, или None, если
    workspace не существует или не принадлежит user (единая проверка
    tenant-изоляции здесь, не в отдельных местах). Эмбеддинг самого
    запроса не тарифицируется — тот же принцип, что и у
    providers.intent.classify_task (дешёвый служебный вызов,
    сознательно unbilled)."""
    workspace = Workspace.objects.filter(id=workspace_id, user=user).first()
    if workspace is None:
        return None

    chunks = list(
        Chunk.objects.filter(
            source__workspace=workspace, source__status=Source.Status.OK
        )
    )
    if not chunks:
        return []

    import numpy as np

    result = NvidiaEmbeddingAdapter().embed([query], model=EMBEDDING_MODEL)
    query_vector = np.array(result.vectors[0])
    query_norm = np.linalg.norm(query_vector) or 1.0

    scored = []
    for chunk in chunks:
        chunk_vector = np.array(chunk.embedding)
        chunk_norm = np.linalg.norm(chunk_vector) or 1.0
        similarity = float(
            np.dot(query_vector, chunk_vector) / (query_norm * chunk_norm)
        )
        scored.append((chunk, similarity))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:top_k]


def format_matches_for_prompt(matches: list[tuple[Chunk, float]]) -> str:
    """Общий форматтер для чата и агентов — оба подмешивают одни и те же
    найденные чанки в промпт модели одним и тем же образом, вместо
    дублирования форматирования на каждой стороне."""
    lines = ["Контекст из базы знаний пользователя:"]
    for chunk, _score in matches:
        lines.append(f"- {chunk.text}")
    return "\n".join(lines)
