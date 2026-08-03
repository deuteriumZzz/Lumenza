# Both builders run entirely locally (python-pptx/openpyxl, no external
# API) — this costs us nothing per-request. Same flat-deterrent-price
# reasoning as code_interpreter.pricing.CODE_EXECUTION_COST_USD, not a
# real cost pass-through.
PPTX_GENERATION_COST_USD = 0.001
EXCEL_GENERATION_COST_USD = 0.001


def estimate_pptx_generation_cost_usd() -> float:
    return PPTX_GENERATION_COST_USD


def estimate_excel_generation_cost_usd() -> float:
    return EXCEL_GENERATION_COST_USD
