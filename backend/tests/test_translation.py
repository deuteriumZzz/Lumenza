from core.translation import translate_prompt_to_english


def test_translate_prompt_to_english_skips_already_english_prompts(
    monkeypatch,
):
    def boom(*args, **kwargs):
        raise AssertionError(
            "should not call an adapter for an English prompt"
        )

    monkeypatch.setattr("providers.registry.get_adapter", boom)
    assert (
        translate_prompt_to_english("a cat on a rooftop")
        == "a cat on a rooftop"
    )


def test_translate_prompt_to_english_translates_cyrillic_prompts(monkeypatch):
    calls = []

    class FakeAdapter:
        def complete(self, prompt, model=None):
            calls.append(prompt)
            from providers.base import ProviderResult

            return ProviderResult(
                text="a cat on a rooftop",
                prompt_tokens=1,
                completion_tokens=1,
                cost_usd=0,
                latency_ms=1,
                model=model,
            )

    monkeypatch.setattr(
        "providers.registry.get_adapter", lambda name: FakeAdapter()
    )
    result = translate_prompt_to_english("кот на крыше")
    assert result == "a cat on a rooftop"
    assert len(calls) == 1


def test_translate_prompt_to_english_falls_back_on_adapter_error(monkeypatch):
    class FailingAdapter:
        def complete(self, prompt, model=None):
            raise RuntimeError("provider down")

    monkeypatch.setattr(
        "providers.registry.get_adapter", lambda name: FailingAdapter()
    )
    assert translate_prompt_to_english("кот на крыше") == "кот на крыше"
