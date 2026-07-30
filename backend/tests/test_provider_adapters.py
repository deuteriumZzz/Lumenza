import base64
import io
from types import SimpleNamespace

import pytest
from PIL import Image

from imagegen.flux_adapter import FluxAdapter
from imagegen.openai_image_adapter import OpenAIImageAdapter
from imagegen.validation import MAX_GENERATED_IMAGE_BYTES
from providers.anthropic_adapter import AnthropicAdapter
from providers.gemini_adapter import GeminiAdapter
from providers.nvidia_adapter import NvidiaAdapter
from providers.openai_adapter import OpenAIAdapter
from providers.validation import validate_token_count


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(output, format="PNG")
    return output.getvalue()


def _openai_chat_response(text="answer", usage=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=usage,
    )


def _patch_openai_client(monkeypatch, response):
    import openai

    completions = SimpleNamespace(create=lambda **_kwargs: response)
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions),
        images=SimpleNamespace(generate=lambda **_kwargs: response),
    )
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)


@pytest.mark.parametrize("adapter_class", [OpenAIAdapter, NvidiaAdapter])
def test_openai_compatible_adapters_reject_missing_usage(
    monkeypatch, settings, adapter_class
):
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.NVIDIA_API_KEY = "test-nvidia-key"
    _patch_openai_client(monkeypatch, _openai_chat_response(usage=None))

    with pytest.raises(ValueError, match="no usage metadata"):
        adapter_class().complete("hello")


@pytest.mark.parametrize("adapter_class", [OpenAIAdapter, NvidiaAdapter])
def test_openai_compatible_adapters_reject_missing_text(
    monkeypatch, settings, adapter_class
):
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.NVIDIA_API_KEY = "test-nvidia-key"
    usage = SimpleNamespace(prompt_tokens=1, completion_tokens=2)
    _patch_openai_client(
        monkeypatch, _openai_chat_response(text=None, usage=usage)
    )

    with pytest.raises(ValueError, match="no text"):
        adapter_class().complete("hello")


@pytest.mark.parametrize("value", [-1, True, 1.5, "10", 1_000_001])
def test_token_count_validation_rejects_untrusted_sdk_values(value):
    with pytest.raises(ValueError, match="token count"):
        validate_token_count(value, "prompt_tokens")


@pytest.mark.parametrize("adapter_class", [OpenAIAdapter, NvidiaAdapter])
def test_openai_compatible_adapters_reject_negative_usage(
    monkeypatch, settings, adapter_class
):
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.NVIDIA_API_KEY = "test-nvidia-key"
    usage = SimpleNamespace(prompt_tokens=-1, completion_tokens=2)
    _patch_openai_client(
        monkeypatch, _openai_chat_response(text="answer", usage=usage)
    )

    with pytest.raises(ValueError, match="token count"):
        adapter_class().complete("hello")


@pytest.mark.parametrize("adapter_class", [OpenAIAdapter, NvidiaAdapter])
def test_openai_compatible_adapters_send_system_and_temperature(
    monkeypatch, settings, adapter_class
):
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.NVIDIA_API_KEY = "test-nvidia-key"
    usage = SimpleNamespace(prompt_tokens=1, completion_tokens=2)
    seen_kwargs = {}

    def fake_create(**kwargs):
        seen_kwargs.update(kwargs)
        return _openai_chat_response(usage=usage)

    import openai

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
    )
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)

    adapter_class().complete(
        "hello", system="Be terse.", temperature=0.4
    )

    assert seen_kwargs["messages"][0] == {
        "role": "system",
        "content": "Be terse.",
    }
    assert seen_kwargs["messages"][1] == {"role": "user", "content": "hello"}
    assert seen_kwargs["temperature"] == 0.4


@pytest.mark.parametrize("adapter_class", [OpenAIAdapter, NvidiaAdapter])
def test_openai_compatible_adapters_omit_absent_system_and_temperature(
    monkeypatch, settings, adapter_class
):
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.NVIDIA_API_KEY = "test-nvidia-key"
    usage = SimpleNamespace(prompt_tokens=1, completion_tokens=2)
    seen_kwargs = {}

    def fake_create(**kwargs):
        seen_kwargs.update(kwargs)
        return _openai_chat_response(usage=usage)

    import openai

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
    )
    monkeypatch.setattr(openai, "OpenAI", lambda **_kwargs: client)

    adapter_class().complete("hello")

    assert seen_kwargs["messages"] == [{"role": "user", "content": "hello"}]
    assert "temperature" not in seen_kwargs


def test_anthropic_adapter_sends_system_and_temperature(monkeypatch, settings):
    settings.ANTHROPIC_API_KEY = "test-anthropic-key"
    seen_kwargs = {}

    def fake_create(**kwargs):
        seen_kwargs.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="answer")],
            usage=SimpleNamespace(input_tokens=1, output_tokens=2),
        )

    import anthropic

    client = SimpleNamespace(messages=SimpleNamespace(create=fake_create))
    monkeypatch.setattr(anthropic, "Anthropic", lambda **_kwargs: client)

    AnthropicAdapter().complete("hello", system="Be terse.", temperature=0.4)

    assert seen_kwargs["system"] == "Be terse."
    assert seen_kwargs["temperature"] == 0.4
    assert seen_kwargs["messages"] == [{"role": "user", "content": "hello"}]


def test_anthropic_adapter_omits_absent_system_and_temperature(
    monkeypatch, settings
):
    settings.ANTHROPIC_API_KEY = "test-anthropic-key"
    seen_kwargs = {}

    def fake_create(**kwargs):
        seen_kwargs.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="answer")],
            usage=SimpleNamespace(input_tokens=1, output_tokens=2),
        )

    import anthropic

    client = SimpleNamespace(messages=SimpleNamespace(create=fake_create))
    monkeypatch.setattr(anthropic, "Anthropic", lambda **_kwargs: client)

    AnthropicAdapter().complete("hello")

    assert "system" not in seen_kwargs
    assert "temperature" not in seen_kwargs


def test_gemini_adapter_sends_system_and_temperature(monkeypatch, settings):
    from google import genai

    settings.GOOGLE_API_KEY = "test-google-key"
    seen_kwargs = {}

    def fake_generate_content(**kwargs):
        seen_kwargs.update(kwargs)
        return SimpleNamespace(
            text="answer",
            usage_metadata=SimpleNamespace(
                prompt_token_count=1, candidates_token_count=2
            ),
        )

    models = SimpleNamespace(generate_content=fake_generate_content)
    monkeypatch.setattr(
        genai, "Client", lambda **_kwargs: SimpleNamespace(models=models)
    )

    GeminiAdapter().complete("hello", system="Be terse.", temperature=0.4)

    config = seen_kwargs["config"]
    assert config.system_instruction == "Be terse."
    assert config.temperature == 0.4


def test_gemini_adapter_rejects_missing_usage(monkeypatch, settings):
    from google import genai

    settings.GOOGLE_API_KEY = "test-google-key"
    response = SimpleNamespace(text="answer", usage_metadata=None)
    models = SimpleNamespace(generate_content=lambda **_kwargs: response)
    monkeypatch.setattr(
        genai, "Client", lambda **_kwargs: SimpleNamespace(models=models)
    )

    with pytest.raises(ValueError, match="no usage metadata"):
        GeminiAdapter().complete("hello")


def test_gemini_adapter_rejects_missing_text(monkeypatch, settings):
    from google import genai

    settings.GOOGLE_API_KEY = "test-google-key"
    response = SimpleNamespace(text=None, usage_metadata=None)
    models = SimpleNamespace(generate_content=lambda **_kwargs: response)
    monkeypatch.setattr(
        genai, "Client", lambda **_kwargs: SimpleNamespace(models=models)
    )

    with pytest.raises(ValueError, match="no text"):
        GeminiAdapter().complete("hello")


@pytest.mark.parametrize(
    "data",
    [None, [], [SimpleNamespace(b64_json=None)]],
)
def test_openai_image_adapter_rejects_missing_image_payload(
    monkeypatch, settings, data
):
    settings.OPENAI_API_KEY = "test-openai-key"
    _patch_openai_client(monkeypatch, SimpleNamespace(data=data))

    with pytest.raises(ValueError, match="no image data"):
        OpenAIImageAdapter().generate("a fox")


def test_openai_image_adapter_normalizes_verified_image(monkeypatch, settings):
    settings.OPENAI_API_KEY = "test-openai-key"
    encoded = base64.b64encode(_png_bytes()).decode("ascii")
    data = [SimpleNamespace(b64_json=encoded)]
    _patch_openai_client(monkeypatch, SimpleNamespace(data=data))

    result = OpenAIImageAdapter().generate("a fox")

    assert result.image_bytes.startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.parametrize(
    "encoded",
    ["not-valid-base64!", base64.b64encode(b"not-an-image").decode("ascii")],
)
def test_openai_image_adapter_rejects_invalid_image_bytes(
    monkeypatch, settings, encoded
):
    settings.OPENAI_API_KEY = "test-openai-key"
    data = [SimpleNamespace(b64_json=encoded)]
    _patch_openai_client(monkeypatch, SimpleNamespace(data=data))

    with pytest.raises(ValueError, match="image"):
        OpenAIImageAdapter().generate("a fox")


def test_flux_adapter_reads_first_iterable_output(monkeypatch, settings):
    import replicate

    settings.REPLICATE_API_TOKEN = "test-replicate-token"
    output = iter([_png_bytes()])
    client = SimpleNamespace(run=lambda *_args, **_kwargs: iter([output]))
    monkeypatch.setattr(replicate, "Client", lambda **_kwargs: client)

    result = FluxAdapter().generate("a fox")

    assert result.image_bytes.startswith(b"\x89PNG\r\n\x1a\n")


def test_flux_adapter_rejects_empty_iterable_output(monkeypatch, settings):
    import replicate

    settings.REPLICATE_API_TOKEN = "test-replicate-token"
    client = SimpleNamespace(run=lambda *_args, **_kwargs: iter([]))
    monkeypatch.setattr(replicate, "Client", lambda **_kwargs: client)

    with pytest.raises(ValueError, match="no image output"):
        FluxAdapter().generate("a fox")


def test_flux_adapter_rejects_oversized_stream(monkeypatch, settings):
    import replicate

    settings.REPLICATE_API_TOKEN = "test-replicate-token"
    output = iter([b"x" * (MAX_GENERATED_IMAGE_BYTES + 1)])
    client = SimpleNamespace(run=lambda *_args, **_kwargs: iter([output]))
    monkeypatch.setattr(replicate, "Client", lambda **_kwargs: client)

    with pytest.raises(ValueError, match="too large"):
        FluxAdapter().generate("a fox")
