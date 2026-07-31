import uuid
from typing import Optional

from django.core.cache import cache

# Long enough to survive a reasonable reconnect/page-reload, bounded so the
# cache doesn't grow unboundedly for abandoned generations. No CHANNEL_LAYERS
# (pub/sub) is configured in this project — the SSE view tails this buffer by
# polling instead, see providers/views.py.
GENERATION_TTL_SECONDS = 2 * 60 * 60


def _key(generation_id: str) -> str:
    return f"chat-stream:{generation_id}"


def create_generation(user_id: int, thread_id: Optional[int]) -> str:
    """Starts a new generation buffer and returns its id. Single-producer
    (only the Celery task that owns this generation ever writes text/status
    after this call) — readers (the SSE view, possibly several concurrent
    tabs) only ever call get_snapshot()."""
    generation_id = uuid.uuid4().hex
    cache.set(
        _key(generation_id),
        {
            "user_id": user_id,
            "thread_id": thread_id,
            "text": "",
            "status": "streaming",
            "payload": None,
            "error": None,
        },
        timeout=GENERATION_TTL_SECONDS,
    )
    return generation_id


def append_delta(generation_id: str, delta: str) -> None:
    key = _key(generation_id)
    snapshot = cache.get(key)
    if snapshot is None:
        # Expired/unknown (TTL raced past a very long generation) — nothing
        # meaningful to append to; the eventual mark_done/mark_error call
        # will also no-op the same way, and any client tailing it will see
        # a 404 from the SSE view instead.
        return
    snapshot["text"] += delta
    cache.set(key, snapshot, timeout=GENERATION_TTL_SECONDS)


def mark_done(generation_id: str, payload: dict) -> None:
    key = _key(generation_id)
    snapshot = cache.get(key) or _empty_snapshot()
    snapshot["status"] = "done"
    snapshot["payload"] = payload
    cache.set(key, snapshot, timeout=GENERATION_TTL_SECONDS)


def mark_error(generation_id: str, error: dict) -> None:
    key = _key(generation_id)
    snapshot = cache.get(key) or _empty_snapshot()
    snapshot["status"] = "error"
    snapshot["error"] = error
    cache.set(key, snapshot, timeout=GENERATION_TTL_SECONDS)


def get_snapshot(generation_id: str) -> Optional[dict]:
    return cache.get(_key(generation_id))


def _empty_snapshot() -> dict:
    return {
        "user_id": None,
        "thread_id": None,
        "text": "",
        "status": "streaming",
        "payload": None,
        "error": None,
    }
