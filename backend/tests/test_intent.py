from types import SimpleNamespace

from providers.intent import DEFAULT_TASK, classify_task

VALID_TASKS = (
    "hook",
    "longform",
    "hashtags",
    "content_plan",
    "repurpose",
    "translation",
    "search",
)


def _patch_openai_response(monkeypatch, text):
    import openai

    completions = SimpleNamespace(
        create=lambda **_kwargs: SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
            usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
        )
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)


def test_classify_task_returns_matching_task(monkeypatch, settings):
    settings.OPENAI_API_KEY = "test-key"
    _patch_openai_response(monkeypatch, "longform")

    assert classify_task("напиши длинную статью", VALID_TASKS) == "longform"


def test_classify_task_matches_task_word_within_extra_text(monkeypatch, settings):
    settings.OPENAI_API_KEY = "test-key"
    _patch_openai_response(monkeypatch, "Это похоже на hashtags.")

    assert classify_task("подбери теги", VALID_TASKS) == "hashtags"


def test_classify_task_falls_back_to_default_on_unparseable_response(
    monkeypatch, settings
):
    settings.OPENAI_API_KEY = "test-key"
    _patch_openai_response(monkeypatch, "непонятный ответ без темы")

    assert classify_task("что угодно", VALID_TASKS) == DEFAULT_TASK


def test_classify_task_falls_back_to_default_on_provider_error(monkeypatch, settings):
    settings.OPENAI_API_KEY = "test-key"
    import openai

    def _raise(**_kwargs):
        raise RuntimeError("boom")

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_raise))
    )
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)

    assert classify_task("что угодно", VALID_TASKS) == DEFAULT_TASK
