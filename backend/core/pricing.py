def lookup_price(table: dict, model: str, kind: str):
    """Общий поиск цены для providers/imagegen/media_ops: без молчаливого
    отката на нулевую стоимость — модель без заданной цены не должна
    доходить до вызова провайдера, иначе запрос прошёл бы без
    тарификации."""
    try:
        return table[model]
    except KeyError as exc:
        raise ValueError(
            f"No pricing configured for {kind} model: {model}"
        ) from exc
