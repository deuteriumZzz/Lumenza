# Self-hosted Piston costs us nothing per-request (own infra, not a
# metered third-party API) — this is a deliberately small flat deterrent
# against abuse of a shared sandbox, not a real cost pass-through. Same
# reasoning as providers.search_adapter.SEARCH_COST_USD_PER_QUERY.
CODE_EXECUTION_COST_USD = 0.001


def estimate_code_execution_cost_usd() -> float:
    return CODE_EXECUTION_COST_USD
