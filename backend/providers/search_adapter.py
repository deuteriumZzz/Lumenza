import time

from django.conf import settings

from providers.base import ProviderAdapter, ProviderResult

TAVILY_URL = "https://api.tavily.com/search"
# Фиксированная наценка за сам вызов Tavily, поверх стоимости LLM-синтеза
# ответа ниже (которая уже точно посчитана OpenAIAdapter по реальным
# токенам) — сам поиск не тарифицируется по токенам.
SEARCH_COST_USD_PER_QUERY = 0.005


class SearchAdapter(ProviderAdapter):
    """Веб-поиск через Tavily + синтез ответа с источниками через уже
    существующий OpenAIAdapter — реализует тот же интерфейс .complete(),
    что и остальные адаптеры, поэтому фолбэк-цикл/биллинг в
    providers.services.run_chat работает без единой правки."""

    name = "search"

    def complete(
        self,
        prompt: str,
        model: str = "gpt-4o-mini",
        system: str | None = None,
        temperature: float | None = None,
        **kwargs,
    ) -> ProviderResult:
        start = time.monotonic()

        if not settings.TAVILY_API_KEY:
            return self._mock_result(prompt, model, start)

        import requests

        from providers.registry import get_adapter

        response = requests.post(
            TAVILY_URL,
            headers={"Authorization": f"Bearer {settings.TAVILY_API_KEY}"},
            json={"query": prompt, "max_results": 5, "include_answer": False},
            timeout=self.request_timeout_seconds,
        )
        response.raise_for_status()
        results = response.json().get("results", [])

        synthesis_prompt = self._build_synthesis_prompt(prompt, results)
        llm_result = get_adapter("openai").complete(
            synthesis_prompt,
            model=model,
            system=system,
            temperature=temperature,
        )

        return ProviderResult(
            text=llm_result.text,
            prompt_tokens=llm_result.prompt_tokens,
            completion_tokens=llm_result.completion_tokens,
            cost_usd=llm_result.cost_usd + SEARCH_COST_USD_PER_QUERY,
            latency_ms=int((time.monotonic() - start) * 1000),
            model=model,
            mocked=llm_result.mocked,
        )

    def _build_synthesis_prompt(self, prompt, results):
        sources = "\n".join(
            f"{i + 1}. {r['title']} — {r['url']}\n{r['content']}"
            for i, r in enumerate(results)
        )
        return (
            f"Вопрос пользователя: {prompt}\n\n"
            f"Результаты веб-поиска:\n{sources}\n\n"
            "Ответь на вопрос по-русски, опираясь на источники выше, и "
            "укажи ссылки на использованные источники в конце ответа."
        )

    def _mock_result(self, prompt: str, model: str, start: float) -> ProviderResult:
        text = f"[мок веб-поиска] {prompt[:150]}"
        latency_ms = int((time.monotonic() - start) * 1000)
        return ProviderResult(
            text=text,
            prompt_tokens=10,
            completion_tokens=10,
            cost_usd=SEARCH_COST_USD_PER_QUERY,
            latency_ms=latency_ms,
            model=model,
            mocked=True,
        )
