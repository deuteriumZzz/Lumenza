from types import SimpleNamespace

from providers.search_adapter import SEARCH_COST_USD_PER_QUERY, SearchAdapter


def test_search_adapter_mocks_without_tavily_key(settings):
    settings.TAVILY_API_KEY = ""

    result = SearchAdapter().complete("what's the weather today")

    assert result.mocked is True
    assert result.cost_usd == SEARCH_COST_USD_PER_QUERY
    assert "what's the weather today" in result.text


def test_search_adapter_synthesizes_answer_with_real_key(monkeypatch, settings):
    settings.TAVILY_API_KEY = "test-tavily-key"
    settings.OPENAI_API_KEY = "test-openai-key"

    import requests

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "results": [
                    {
                        "title": "Example",
                        "url": "https://example.com",
                        "content": "some snippet",
                    }
                ]
            }

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr(requests, "post", fake_post)

    import openai

    completions = SimpleNamespace(
        create=lambda **_kwargs: SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content="Synthesized answer with a source link."
                    )
                )
            ],
            usage=SimpleNamespace(prompt_tokens=50, completion_tokens=30),
        )
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)

    result = SearchAdapter().complete("what's new today", model="gpt-4o-mini")

    assert captured["headers"]["Authorization"] == "Bearer test-tavily-key"
    assert captured["json"]["query"] == "what's new today"
    assert result.text == "Synthesized answer with a source link."
    assert result.mocked is False
    # Стоимость синтеза (по реальным токенам через OpenAIAdapter) плюс
    # фиксированная наценка за сам вызов Tavily.
    assert result.cost_usd > SEARCH_COST_USD_PER_QUERY
