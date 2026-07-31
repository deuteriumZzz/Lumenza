from dataclasses import dataclass
from typing import Callable


@dataclass
class ProviderResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    model: str
    mocked: bool = False


class ProviderAdapter:
    name: str = "base"
    max_completion_tokens: int = 1024
    # Зависший вызов у провайдера блокирует поток запроса; с учётом
    # цепочки запасных вариантов маршрута (до len(route) вызовов
    # провайдера на запрос) неограниченный таймаут на вызов мог бы во
    # много раз увеличить задержку запроса в худшем случае.
    request_timeout_seconds: float = 15.0

    def complete(self, prompt: str, **kwargs) -> ProviderResult:
        raise NotImplementedError

    def stream_complete(
        self, prompt: str, on_delta: Callable[[str], None], **kwargs
    ) -> ProviderResult:
        """Same contract as complete() (returns one final ProviderResult),
        but calls on_delta(text) as text becomes available so a caller can
        show progress. Default: adapters without real incremental
        streaming (currently SearchAdapter, since Tavily itself isn't a
        streaming API) just emit the whole result as a single delta once
        complete() returns — callers always get a stream-shaped interface,
        even when nothing was actually streamed under the hood."""
        result = self.complete(prompt, **kwargs)
        on_delta(result.text)
        return result
