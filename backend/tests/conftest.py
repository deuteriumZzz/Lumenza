import pytest


@pytest.fixture(autouse=True)
def _never_call_real_providers(settings):
    """The test suite must never depend on or spend real provider API
    credits, no matter what's set in the local .env for manual verification —
    force every provider key empty so every adapter always takes its mock
    path (see each adapter's `if not settings.X_API_KEY` branch)."""
    settings.OPENAI_API_KEY = ""
    settings.ANTHROPIC_API_KEY = ""
    settings.GOOGLE_API_KEY = ""
    settings.REPLICATE_API_TOKEN = ""
    settings.NVIDIA_API_KEY = ""
    settings.PISTON_API_URL = ""


@pytest.fixture(autouse=True)
def _use_isolated_cache(settings):
    """Production correctly points CACHES at real Redis (lumenza/settings.py)
    so DRF throttle state is shared across gunicorn workers — but that same
    persistence is exactly wrong for tests: unlike Django's implicit default
    (an in-process LocMemCache that starts empty every `pytest` invocation),
    real Redis keeps throttle history (e.g. the "auth" scope's request
    timestamps) across separate `docker compose run ... pytest` runs, since
    the Redis container itself keeps running between them. Several
    auth-endpoint tests hit the same throttle identity (same source IP) and
    started flaking with 429s once CACHES pointed at real Redis. Force an
    isolated in-memory cache for the whole test session instead."""
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }
