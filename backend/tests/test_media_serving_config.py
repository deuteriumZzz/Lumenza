from pathlib import Path

import pytest
from django.test import override_settings
from django.views.static import serve

from lumenza.media_config import resolve_media_root
from lumenza.urls import media_urlpatterns


def test_public_media_serving_requires_an_explicit_root():
    with pytest.raises(RuntimeError, match="MEDIA_ROOT"):
        resolve_media_root(
            base_dir=Path("/app"),
            configured_root="",
            serve_media_files=True,
            debug=False,
        )


def test_default_media_root_remains_available_for_local_debug():
    assert resolve_media_root(
        base_dir=Path("/app"),
        configured_root="",
        serve_media_files=True,
        debug=True,
    ) == Path("/app/media")


@override_settings(SERVE_MEDIA_FILES=False)
def test_media_serving_can_be_disabled_outside_debug():
    assert media_urlpatterns() == []


@override_settings(
    SERVE_MEDIA_FILES=True,
    MEDIA_ROOT="/tmp/lumenza-public-test-media",
)
def test_media_serving_can_use_an_isolated_test_root_outside_debug():
    patterns = media_urlpatterns()

    assert len(patterns) == 1
    assert patterns[0].callback == serve
    assert str(patterns[0].pattern) == r"^media/(?P<path>.*)$"
    assert patterns[0].default_args == {
        "document_root": "/tmp/lumenza-public-test-media"
    }
