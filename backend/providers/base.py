from dataclasses import dataclass


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
