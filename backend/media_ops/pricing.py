from core.pricing import lookup_price

# Временное значение — фиксированная цена в USD за запрос — тарификация
# NVIDIA NIM основана на кредитах, а не на опубликованной ставке за
# минуту/страницу/символ на момент интеграции. TODO: сверить с реальным
# счётом NVIDIA, затем перейти на реальную метрику за минуту (ASR/TTS)
# или за страницу (OCR), когда появится разбор длительности/числа
# страниц.
TRANSCRIPTION_PRICING = {
    "nvidia/canary-1b-asr": 0.006,
}

SPEECH_PRICING = {
    "nvidia/magpie-tts-multilingual": 0.015,
}

DOCUMENT_PRICING = {
    # nvidia/nemoretriever-parse — временная фиксированная цена, та же
    # логика, что и у остальных цен на медиа здесь. Заменила
    # meta/llama-3.2-11b-vision-instruct, когда nemoretriever-parse
    # оказалась на самом деле рабочей (см. докстринг в
    # nvidia_ocr_adapter.py) — цена старого ключа оставлена как
    # стартовая оценка, поскольку ни одна из них никогда не проверялась
    # по реальному биллингу.
    "nvidia/nemoretriever-parse": 0.010,
}

PHOTO_ANALYSIS_PRICING = {
    # Та же логика фиксированной цены за запрос, что и у
    # DOCUMENT_PRICING выше — nvidia/llama-3.1-nemotron-nano-vl-8b-v1
    # это настоящий vision-language чат-вызов, тарифицируется у
    # провайдера потокенно, здесь для единообразия сведён к
    # фиксированной цене.
    "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": 0.008,
}


def estimate_transcription_cost_usd(model: str) -> float:
    return lookup_price(TRANSCRIPTION_PRICING, model, "transcription")


def estimate_speech_cost_usd(model: str) -> float:
    return lookup_price(SPEECH_PRICING, model, "speech")


def estimate_document_cost_usd(model: str) -> float:
    return lookup_price(DOCUMENT_PRICING, model, "document")


def estimate_photo_analysis_cost_usd(model: str) -> float:
    return lookup_price(PHOTO_ANALYSIS_PRICING, model, "photo analysis")


# Живой голосовой режим (Gemini Live API) тарифицируется провайдером
# по токенам аудио, не по минутам — здесь это сведено к оценке за минуту
# сессии (вход ~$0.005/мин + выход ~$0.018/мин по данным на момент
# интеграции), той же логике placeholder-цены, что и у остального в
# этом файле. TODO: сверить с реальным счётом Google, когда появится
# первый настоящий трафик.
LIVE_VOICE_USD_PER_MINUTE = 0.023


def estimate_live_voice_cost_usd(minutes: float) -> float:
    return max(0.0, minutes) * LIVE_VOICE_USD_PER_MINUTE
