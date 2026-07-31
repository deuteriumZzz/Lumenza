from dataclasses import dataclass

from django.conf import settings

from code_interpreter.pricing import estimate_code_execution_cost_usd

DEFAULT_LANGUAGE = "python"
# "*" — Piston's own "latest installed version" selector (verified live
# against a real self-hosted instance), so this doesn't need updating
# whenever a newer Python gets installed via `manage.py setup_piston`.
DEFAULT_VERSION = "*"

RUN_TIMEOUT_MS = 10_000
RUN_MEMORY_LIMIT_BYTES = 128 * 1024 * 1024


@dataclass
class CodeExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    language: str
    version: str
    cost_usd: float
    mocked: bool = False


class PistonAdapter:
    """Thin client for a self-hosted Piston instance (docker-compose.yml
    `piston` service) — the public emkc.org API stopped being freely
    available to commercial projects in 2026, so this project runs its
    own. No API key concept for Piston; PISTON_API_URL unset means "not
    running/not set up yet" and falls back to a mock, same convention as
    every other adapter's "no key -> mock" branch."""

    name = "piston"
    request_timeout_seconds = 15.0

    def execute(self, code: str, **kwargs) -> CodeExecutionResult:
        if not settings.PISTON_API_URL:
            return self._mock_result(code)

        import requests

        response = requests.post(
            f"{settings.PISTON_API_URL}/api/v2/execute",
            json={
                "language": DEFAULT_LANGUAGE,
                "version": DEFAULT_VERSION,
                "files": [{"content": code}],
                "run_timeout": RUN_TIMEOUT_MS,
                "run_memory_limit": RUN_MEMORY_LIMIT_BYTES,
            },
            timeout=self.request_timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        run = data["run"]

        return CodeExecutionResult(
            stdout=run["stdout"],
            stderr=run["stderr"],
            exit_code=run["code"],
            language=data["language"],
            version=data["version"],
            cost_usd=estimate_code_execution_cost_usd(),
            mocked=False,
        )

    def _mock_result(self, code: str) -> CodeExecutionResult:
        return CodeExecutionResult(
            stdout=f"[mock output for {len(code)} chars of code]",
            stderr="",
            exit_code=0,
            language=DEFAULT_LANGUAGE,
            version="mock",
            cost_usd=estimate_code_execution_cost_usd(),
            mocked=True,
        )
