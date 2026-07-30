from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from billing.models import LedgerEntry
from billing.services import claim_pending_record as _claim
from billing.services import grant_credits
from billing.services import refund_hold as _refund_hold
from billing.services import usd_to_credits
from core.constants import ERROR_MESSAGE_MAX_LEN
from knowledge.chunking import chunk_text
from knowledge.embedding_adapter import NvidiaEmbeddingAdapter
from knowledge.models import Chunk, Source
from knowledge.pricing import estimate_embedding_cost_usd
from media_ops.nvidia_ocr_adapter import NvidiaOcrAdapter


def ingest_source(source_id: int) -> None:
    """Извлекает (для kind=IMAGE), разбивает на чанки и эмбеддит один
    Source. Тот же shape ошибок/реконсиляции кредитов, что и у
    media_ops.tasks (claim -> try/except с refund -> reconcile ->
    сохранить). Дополнительная ошибка v1: пустой извлечённый текст (пустое
    изображение, пустая вставка) — считается ошибкой, а не пустым
    успехом, чтобы не создавать Source без единого чанка для поиска."""
    source = _claim(Source, source_id)
    if source is None:
        return

    try:
        raw_text = source.raw_text
        if source.kind == Source.Kind.IMAGE:
            image_bytes = source.image.read()
            ocr_result = NvidiaOcrAdapter().extract(image_bytes)
            raw_text = ocr_result.text

        pieces = chunk_text(raw_text)
        if not pieces:
            raise ValueError("No text to index")

        embed_result = NvidiaEmbeddingAdapter().embed(
            pieces, model=source.model
        )
    except Exception as exc:
        _refund_hold(source)
        source.status = Source.Status.ERROR
        source.error_message = str(exc)[:ERROR_MESSAGE_MAX_LEN]
        source.completed_at = timezone.now()
        source.save(
            update_fields=[
                "status",
                "error_message",
                "credits_charged",
                "completed_at",
            ]
        )
        return

    actual_cost = estimate_embedding_cost_usd(source.model, len(pieces))
    actual_credits = usd_to_credits(actual_cost)
    refund = source.credits_charged - actual_credits
    if refund > 0:
        grant_credits(source.user, refund, reason=LedgerEntry.Reason.REFUND)

    Chunk.objects.bulk_create(
        [
            Chunk(source=source, index=index, text=piece, embedding=vector)
            for index, (piece, vector) in enumerate(
                zip(pieces, embed_result.vectors)
            )
        ]
    )

    source.raw_text = raw_text
    source.cost_usd = Decimal(str(actual_cost))
    source.credits_charged = actual_credits
    source.mocked = embed_result.mocked
    source.status = Source.Status.OK
    source.completed_at = timezone.now()
    source.save()


ingest_source_task = shared_task(name="knowledge.ingest_source")(ingest_source)
