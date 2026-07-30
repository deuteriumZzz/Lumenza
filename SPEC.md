# Lumenza — spec

## Что это
Мультимодальный AI-агрегатор с веб-интерфейсом и Telegram-клиентом. Lumenza объединяет чат, актуальный поиск, изображения, голос, документы и анализ медиа, автоматически маршрутизирует запросы между провайдерами и позволяет явно выбрать совместимую модель. Маркетинг и контент остаются одной из специализированных категорий, но не ограничивают продукт.

## Explicitly out of scope (MVP)
- Видео-генерация (Sora/Veo/Kling-подобные)
- Музыка (Suno-подобные)
- Крипто-платежи, мультивалютность
- OpenRouter (добавляется позже как fallback-слой)

## Стратегия: агрегатор, а не узкая ниша (пересмотрено)
Lumenza — сознательно комбайн-агрегатор AI-моделей, а не узкий инструмент с парой провайдеров. Конкурируем с SYNTX.AI и аналогами не количеством моделей самим по себе, а **качеством, скоростью, креативностью и масштабируемостью** каталога. Отсюда правило: каждая новая модель проходит **curation gate** — добавляется только под конкретную категорию задачи (см. task-based routing ниже) после проверки качества на этой задаче, а не потому что она доступна в каком-то каталоге. Это тот же принцип, что раньше выражался как "не 90+ инструментов" — просто теперь применяется к контролю качества добавления, а не к ограничению количества.

Юридический риск (см. ниже) с ростом каталога не снижается, а растёт в важности: ценность продукта должна быть в кураторстве/сценариях/task-routing, а не в широте доступа к чужим API.

## Архитектура
- **Backend**: Django + DRF, Postgres, Celery + Redis (долгие задачи — генерация картинок)
- **Frontend**: Next.js (React), дизайн — Impeccable + Anti-Slop (design-taste-frontend) как база;
  - лендинг: + FRESHTECHBRO 3D (react-three-fiber/threejs-webgl/lightweight-3d-effects) + animated-component-libraries (Magic UI/React Bits)
  - продуктовый UI (чат/кабинет): + emil-design-eng (сдержанная физичная микро-анимация, без 3D)
  - админка: стандартный Django admin, минимальный полиш, без 3D
- **Telegram bot**: aiogram (Python), общий API с вебом, общий аккаунт/баланс
- **Providers layer** (адаптеры, единый интерфейс):
  - Текст: OpenAI, Anthropic, Google Gemini + NVIDIA NIM (build.nvidia.com/models, один API-ключ на весь каталог) и далее — любой каталог, но только через curation gate (см. Фазу 11)
  - Картинки: OpenAI Images + Replicate/Flux, расширяется тем же принципом
- **Routing**: task-based — внутренние технические профили маршрутизации (универсальный чат, подробный ответ, перевод, поиск, бизнес/контент; реализм/иллюстрация/премиум для изображений) → приоритетный список (провайдер, модель) с fallback при отказе. В UI профили сгруппированы по понятным пользовательским сценариям, а внутренние ключи сохранены для совместимости.
- **Billing**: внутренний кредитный леджер (таблица движений: начисление/списание, provider cost * markup), топ-ап через ЮKassa (RU/CIS)
- **Observability**: `RequestLog` (provider, cost, latency, status) на каждый вызов провайдера с первого дня — основа админ-дэшборда маржи
- **Antiabuse**: rate-limit (DRF throttling / django-ratelimit), moderation prefilter на промпты (regex + moderation endpoint провайдера), дневные лимиты по тарифу

## Юридический риск (учитывать при работе с провайдерами)
Usage Policies OpenAI/Anthropic/Google запрещают чистый resell голого API-доступа как конкурирующего сервиса без добавленной ценности. Lumenza добавляет её через маршрутизацию и fallback, единый баланс и историю, поиск, мультимодальную студию, понятные сценарии и прозрачный выбор модели.

## Repo hygiene note
Git-репозиторий на уровне `$HOME` (`/Users/deuterium`) — грязный, без коммитов, не используется для этого проекта. `Lumenza/` имеет собственный git-репозиторий, используется как есть.

## Фазы (thin vertical slices)

### Phase 0 — Project scaffolding & repo hygiene
Новый git-repo (уже есть, пустой), Django+DRF backend skeleton, Postgres, Redis, Celery, .env config, docker-compose для local dev.
**Acceptance**: `docker compose up` поднимает web+db+redis+worker; `/health` → 200; миграции применяются чисто.

### Phase 1 — Auth + Credits ledger + 1 провайдер (OpenAI) e2e
User model, credit ledger app, provider adapter interface, OpenAI adapter подключён end-to-end.
**Acceptance**: авторизованный юзер шлёт chat-запрос через API, кредиты списываются корректно, создаётся RequestLog со стоимостью/латентностью.

### Phase 2 — Multi-provider chat + routing
+ Anthropic, + Google Gemini, таблица режимов (fast/smart/cheap), fallback при ошибке провайдера.
**Acceptance**: смена режима роутит на нужную модель; смоделированный сбой провайдера триггерит fallback и логируется.

### Phase 3 — Веб-чат UI (Next.js) + design pass
Chat interface, mode selector, история, баланс, простая pricing/topup-страница (стаб-платёж или sandbox). Дизайн-стек — см. Архитектура выше.
**Acceptance**: полный путь кликабелен в браузере: вход → чат → видно списание → видна история.

### Phase 4 — Image generation
2 image-провайдера, image chat mode + галерея в веб-UI.
**Acceptance**: prompt → moderation check → картинка сгенерирована → сохранена → показана в галерее → кредиты списаны.

### Phase 5 — Telegram bot (aiogram)
/start онбординг, текст+картинки командами, баланс, inline-переключение режима, webhook деплой.
**Acceptance**: бот в Telegram проходит тот же ключевой путь, что и веб, общий аккаунт/кредиты.

### Phase 6 — Billing (ЮKassa)
Топ-ап флоу, webhook handling с верификацией подписи, идемпотентность (защита от дублей начисления).
**Acceptance**: тестовый платёж зачисляет кредиты, ledger-запись создаётся, повторный webhook не дублирует зачисление.

### Phase 7 — Admin & margin dashboard
Django admin: юзеры, расходы по провайдерам, маржа, ошибки.
**Acceptance**: видно cost vs revenue по юзеру/дню, топ источников ошибок.

### Phase 8 — Abuse guardrails & rate limits
Rate-limit по тарифу, moderation prefilter, банлисты паттернов, anomaly flags.
**Acceptance**: превышение лимита → контролируемый 429 с понятным сообщением; запрещённый контент блокируется до вызова провайдера (экономит деньги).

### Phase 9 — QA/Security/Marketing audit loop (повторяющийся гейт перед production)
1. **Playwright** — обход всех кликабельных элементов веб-UI (отправка сообщения, смена режима, топ-ап, история, deep-link в бота)
2. **design-audit (bencium)** — оценка визуального качества после Impeccable/Anti-Slop/FRESHTECHBRO/emil-design-eng прохода
3. **Security review**: `ecc:security-review`/`ecc:security-scan` (быстрый первый проход) → прицельные скиллы из `anthropic-cybersecurity-skills`:
   - API: `testing-api-security-with-owasp-top-10`, `testing-api-for-broken-object-level-authorization`, `testing-api-for-mass-assignment-vulnerability`, `testing-api-authentication-weaknesses`, `exploiting-excessive-data-exposure-in-api`
   - Rate-limit/antiabuse: `implementing-api-rate-limiting-and-throttling`, `implementing-api-abuse-detection-with-rate-limiting`, `detecting-api-enumeration-attacks`
   - Платёжные вебхуки: `testing-for-host-header-injection`, `testing-api-authentication-weaknesses` + ручная проверка HMAC-подписи и идемпотентности
   - LLM-прокси: `detecting-ai-model-prompt-injection-attacks`, `detecting-indirect-prompt-injection`, `testing-prompt-injection-in-rag-pipelines`
   - Auth/токены: `testing-for-json-web-token-vulnerabilities`, `implementing-api-key-security-controls`
   - Инфра/зависимости: `performing-sca-dependency-scanning-with-snyk`, `implementing-secrets-scanning-in-ci-cd`, `scanning-containers-with-trivy-in-cicd`
   - Инъекции: `exploiting-sql-injection-vulnerabilities`
   - Триаж: `performing-web-application-vulnerability-triage`
4. **Продуктовый аудит**: проверить широкое позиционирование AI-агрегатора; бизнес, маркетинг и контент должны оставаться сценариями внутри продукта, а не описанием всего продукта.

Находки фиксятся → цикл повторяется, пока все 4 проверки не пройдут чисто.

### Phase 10 — Task-based роутинг (рефакторинг)
Заменить `MODE_ROUTES`/`IMAGE_ROUTES` (fast/smart/cheap, openai/flux) на `TASK_ROUTES` с ключами-категориями задач вместо режимов скорости/цены. Каждая категория — приоритетный список (provider, model) с fallback, тот же паттерн, что и раньше.
**Acceptance**: существующие e2e-сценарии (веб + бот) работают через новые категории вместо старых режимов, поведение fallback и биллинга не регрессирует, все прежние тесты переписаны под новые ключи и проходят.

### Phase 11 — Curated multi-provider expansion (NVIDIA NIM + далее) — ✅ первая модель подключена
Новый адаптер `providers/nvidia_adapter.py` — NVIDIA NIM отдаёт OpenAI-совместимый API (единый ключ на весь каталог build.nvidia.com/models), переиспользует `openai` SDK с другим `base_url`, тот же mock-fallback паттерн, что и у остальных адаптеров.

**Подключена и протестирована первая модель**: `meta/llama-3.2-3b-instruct` — добавлена третьим fallback-кандидатом в категорию `hashtags` (`TASK_ROUTES`), после того как primary (Gemini) и secondary (OpenAI) уже отказали. Обоснование: маленькая/быстрая модель подходит именно для дешёвой структурной задачи (хэштеги); не поставлена primary, так как строгого side-by-side сравнения качества с Gemini/OpenAI не проводилось — только живая проверка связности и связности ответа. Дальнейшие модели добавляются тем же процессом: реальный тестовый вызов → обоснование выбора конкретной категории → место в `TASK_ROUTES` (primary только после явного сравнения качества).

**Цена — placeholder**: build.nvidia.com не публикует статический прайс за токен (биллинг кредитный/SPA без прямого прайс-листа). `providers/pricing.py` временно использует цену gemini-1.5-flash как консервативную оценку для этой модели, помечено `TODO: verify against real NVIDIA invoice` — требует подтверждения по реальному счёту NVIDIA перед тем, как полагаться на неё для биллинга в проде.

**Побочная находка**: реальный вызов вскрыл конфликт версий `openai==1.51.0`/`httpx` (SDK передаёт `proxies`, которого нет в httpx≥0.28) — баг существовал с самого начала проекта, но не проявлялся, пока все провайдерские ключи были пустыми (mock-режим). Зафиксирован пином `httpx==0.27.2` в requirements.txt. Также добавлен `conftest.py` — автотесты всегда обнуляют все `*_API_KEY` вне зависимости от содержимого `.env`, чтобы прогон тестов никогда не тратил реальные платные вызовы.

**Acceptance**: ✅ минимум одна NVIDIA-модель протестирована (живой вызов + автотест на fallback) и назначена на конкретную категорию с обоснованием; процесс добавления задокументирован для дальнейших моделей.

**Обновление — полное расширение по запросу пользователя ("не одну модель, а все")**:

*Реальный каталог отличался от sitemap-слагов build.nvidia.com* — URL-слаги (`llama-3_3`, `llama-3_1-...`) не совпадают с ID моделей для API (точки вместо подчёркиваний, некоторые вообще не провизионированы для аккаунта несмотря на присутствие в общем листинге — например `nvidia/riva-translate-4b-instruct` даёт 404 "Function not found for account"). Правильный способ узнать реальные вызываемые ID — `GET /v1/models` (OpenAI-совместимый listing-эндпоинт), а не парсинг сайта.

**Текст** — дополнительно curated и живо протестированы (батчем, не по одной):
- `meta/llama-3.1-8b-instruct` → 3-й fallback в `repurpose`
- `google/gemma-2-2b-it` → 4-й fallback в `repurpose`
- `qwen/qwen3.5-122b-a10b` → 3-й fallback в `content_plan`
- `nvidia/llama-3.3-nemotron-super-49b-v1` → 4-й fallback в `content_plan`
- `qwen/qwen3-next-80b-a3b-instruct` → 3-й fallback в `translation` (после того как `riva-translate` не вышел)
- `nvidia/nvidia-nemotron-nano-9b-v2` → 3-й fallback в `hook` (был без NVIDIA-кандидата)
- `nvidia/llama-3.3-nemotron-super-49b-v1.5` → 3-й fallback в `longform` (был без NVIDIA-кандидата)
- `meta/llama-3.2-3b-instruct` + `nvidia/nemotron-mini-4b-instruct` → 3-й и 4-й fallback в `hashtags`

Все 6 текстовых категорий теперь имеют минимум один NVIDIA-фоллбек.

**Ещё один батч (включая DeepSeek и другие непроверенные семейства)** — живо протестированы:
- `deepseek-ai/deepseek-v4-flash` → `hook` (4-й fallback)
- `minimaxai/minimax-m3` + `abacusai/dracarys-llama-3.1-70b-instruct` → `longform` (4-й, 5-й)
- `stepfun-ai/step-3.7-flash` → `hashtags` (5-й)
- `upstage/solar-10.7b-instruct` → `content_plan` (5-й)
- `minimaxai/minimax-m2.7` → `repurpose` (5-й)
- `sarvamai/sarvam-m` → `translation` (4-й)

Отклонены: `deepseek-ai/deepseek-v4-pro` (таймаут), `deepseek-ai/deepseek-coder-6.7b-instruct`, `moonshotai/kimi-k2.6`, `ibm/granite-3.0-8b-instruct`, `microsoft/phi-3.5-moe-instruct` (все — 404, не provisioned).

Каждая из 6 категорий теперь имеет 4-5 кандидатов (primary + 3-4 fallback).

**Финальный батч — оставшиеся ~45 моделей проверены** (пропущены заведомо нерелевантные для чата: embedding, vision-only, safety-guard/reward, code-specific, NER/PII, CLIP — им нет смысла отвечать на текстовый промпт так же). **16 из 41 реально протестированных ответили** — в т.ч. `nvidia/riva-translate-4b-instruct-v1.1` (новая версия того самого riva-translate, который раньше давал 404 — v1.1 работает!).

Подключены в `TASK_ROUTES` по одной модели на категорию (иначе цепочки fallback раздулись бы до абсурда, что противоречит curation gate):
- `hook` → `openai/gpt-oss-120b`
- `longform` → `meta/llama-3.1-70b-instruct`
- `hashtags` → `nvidia/nemotron-3-nano-30b-a3b`
- `content_plan` → `nvidia/nemotron-3-ultra-550b-a55b`
- `repurpose` → `mistralai/mistral-nemotron`
- `translation` → `nvidia/riva-translate-4b-instruct-v1.1`

**Резерв-пул — ПОДКЛЮЧЁН (2026-07-19/20)**: по явному запросу пользователя все 10 моделей резерва (`bytedance/seed-oss-36b-instruct`, `google/gemma-3n-e2b-it`, `google/gemma-3n-e4b-it`, `mistralai/mistral-small-4-119b-2603`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-super-120b-a12b`, `openai/gpt-oss-20b`, `poolside/laguna-xs-2.1`, `stepfun-ai/step-3.5-flash`, `thinkingmachines/inkling`) добавлены как дополнительные fallback-кандидаты в `TASK_ROUTES` (1-2 на категорию, распределены по сигналу в названии — "nano/xs/mini" → hashtags/repurpose, "reasoning/super/ultra" → longform/content_plan). Цепочки fallback теперь 6-8 кандидатов глубиной — это осознанно нарушает изначальный принцип "primary+3-4 fallback" ради полноты каталога; практическая ценность порядка fallback за пределами первых 3-4 кандидатов сомнительна, что делает будущую фичу "выбор модели пользователем" (см. открытое архитектурное решение) более значимой, а не менее.

Всего из 119 моделей каталога: **32 текстовых + 2 картиночных (генерация + edit) реально подключены в TASK_ROUTES**, ~85 не протестированы или сознательно пропущены (нерелевантные модальности/embedding/code/safety).

**Image-edit — flux.1-kontext-dev подключён (2026-07-19/20)**: новая категория `imagegen.services.IMAGE_TASK_ROUTES["edit"]`, отдельный вход `start_image_edit`/`ImageEditView` (`POST /api/images/edit/`, multipart: prompt + image file), т.к. это единственная NVIDIA image-модель, принимающая входное изображение, а не только текст. Реверс-инжиниринг схемы запроса (не задокументирована нигде на build.nvidia.com): входное изображение сначала грузится через отдельный NVCF Assets API (`POST https://api.nvcf.nvidia.com/v2/nvcf/assets` → `{assetId, uploadUrl}`, затем `PUT` байтов на `uploadUrl`), потом ссылается в теле генерации как `data:image/png;example_id,<assetId>` (ключевое слово `example_id`, не `base64`) + заголовок `NVCF-INPUT-ASSET-REFERENCES`. **Формат подтверждён верно** (проходит валидацию NVIDIA, ошибка сдвинулась с 422 на 500), но **живая генерация стабильно возвращает 500 Internal Server Error** (`nvcf-status: errored`) независимо от промпта/картинки — похоже на тот же паттерн "listed but not provisioned for this account", что и у других моделей в этом документе. Адаптер (`imagegen/nvidia_image_adapter.py`'s `edit()`) поднимает исключение как обычно → кредиты рефандятся, статус `error` — протестировано живым end-to-end вызовом через реальный API. Заработает автоматически, как только NVIDIA стабилизирует эту модель для аккаунта.

**Дозачистка — image-модели и голос/OCR (2026-07-19, повторный заход)**:

- **Картинки**: `stabilityai/stable-diffusion-3-medium` — эндпоинт реальный, но 404 "not provisioned" (как и многие текстовые); `black-forest-labs/flux.1-kontext-dev` — реально отвечает, но это image-EDIT модель (требует входное изображение, не text-to-image) — не подключена, годится для будущей фичи "редактировать картинку"; `qwen/qwen-image` — слаг не резолвится ни в одном варианте (dot/underscore), не найден.
- **ASR/TTS**: дополнительно пробовал OpenAI-SDK-совместимые аудио-эндпоинты (`client.audio.transcriptions.create`, `client.audio.speech.create`) через тот же `integrate.api.nvidia.com` — тоже 404 "page not found" (маршрут в принципе не существует под этим API, не просто "не provisioned"). Остаются неподтверждёнными.
- **OCR — ИСПРАВЛЕНО, реально работает**: вместо сломанного `nemoretriever-parse`-эндпоинта используется **vision-language модель через тот же chat completions**, что и текст (image_url content block, как GPT-4V). `meta/llama-3.2-11b-vision-instruct` — новый `DEFAULT_MODEL` в `media_ops/nvidia_ocr_adapter.py`, живо протестирован на реальном тексте на картинке — извлёк дословно верно. `nvidia/nemotron-nano-12b-v2-vl` тоже отвечает, но галлюцинирует на пустых картинках — не выбран как default. Ограничение: работает только с изображениями (PNG/JPEG), PDF пока не растеризуется в код-пути.

**КРИТИЧЕСКАЯ находка — worker/bot образы не пересобирались**: `docker compose build web` пересобирает только `web`-сервис; `worker` и `bot` — **отдельные образы** (несмотря на общий Dockerfile) и не подхватили пин `httpx==0.27.2` до этого момента. Это означало, что любая асинхронная Celery-задача с реальным ключом (генерация картинок, голос/OCR) могла падать на баге `proxies`, даже когда прямые вызовы адаптера через `docker compose run --rm web` работали нормально. Пересобраны `worker` и `bot`. **После пересборки — картинки (flux.1-dev/premium) и OCR подтверждены живым end-to-end тестом через реальный HTTP + Celery-воркер**, не только прямым вызовом адаптера.

Отклонены после живого теста (404 "not provisioned for account" несмотря на присутствие в `/v1/models`, если не указано иное): `meta/llama-3.3-70b-instruct`, `mistralai/mistral-large-3-675b-instruct-2512` (таймаут >15с), `nvidia/riva-translate-4b-instruct`, `writer/palmyra-creative-122b`, `ai21labs/jamba-1.5-large-instruct`, `nvidia/llama-3.1-nemotron-ultra-253b-v1`, `nvidia/nemotron-4-340b-instruct`, `mistralai/mixtral-8x22b-v0.1`, `mistralai/mistral-7b-instruct-v0.3`, `01-ai/yi-large`, `z-ai/glm-5.2` (таймаут).

**Картинки** — новый адаптер `imagegen/nvidia_image_adapter.py`, отдельный API-паттерн (не OpenAI-совместимый!): `POST https://ai.api.nvidia.com/v1/genai/{org}/{model}`, синхронный ответ `{"artifacts":[{"base64": ...}]}`. Живо протестирован `black-forest-labs/flux.1-dev` → новая категория `premium` (не влезла чисто ни в `realistic`, ни в `illustration` — общего сравнения качества не проводилось).

**Новые модальности (голос-в-текст, текст-в-голос, OCR)** — новое приложение `media_ops` (модели `Transcription`/`SpeechClip`/`DocumentExtraction`, адаптеры, Celery-задачи, эндпоинты `/api/transcriptions/`, `/api/speech/`, `/api/documents/`, страницы `/voice` и `/documents`, обработка `voice`/`document`/`photo` сообщений в боте). Цена — flat placeholder за запрос (не per-minute/per-page — для этого нужен парсинг длительности аудио/страниц, отдельная работа), также помечена TODO.

**ASR/TTS — ПОДТВЕРЖДЕНЫ РАБОЧИМИ через gRPC (2026-07-19/20)**: REST/`genai`-эндпоинт для `nvidia/canary-1b-asr` и `nvidia/magpie-tts-multilingual` действительно не существует (404, а не "not provisioned") — эти Riva-модели вызываются **исключительно через gRPC**, пакет `nvidia-riva-client`. Сервер и per-модельный `function-id` не задокументированы на build.nvidia.com (REST-ориентированная страница API), найдены через официальные Riva client example-скрипты (`python-clients` репозиторий, через веб-поиск): `grpc.nvcf.nvidia.com:443` + заголовок метаданных `function-id` (ASR: `b0e8b4a5-217c-40b7-9b96-17d84e666317`, TTS: `877104f7-e885-42b9-8de8-f6e4c6303969`, голос `Magpie-Multilingual.EN-US.Aria`) рядом с обычным `authorization: Bearer`. **Живой замкнутый цикл подтверждён дважды**: (1) сырой gRPC-скрипт — TTS синтезировал реальную фразу, ASR корректно распознал её обратно; (2) через реальный продакшен API (`/api/speech/` → воркер → `/api/transcriptions/`) — тот же результат, `status=ok`, `mocked=false`.

Адаптеры (`media_ops/nvidia_asr_adapter.py`, `nvidia_tts_adapter.py`) переписаны на `riva.client.ASRService`/`SpeechSynthesisService`. Входное аудио (Telegram OGG/Opus, браузерный WebM/Opus, произвольная загрузка) всегда транскодируется через `ffmpeg`-субпроцесс (добавлен в `Dockerfile`) в raw PCM 16kHz моно перед отправкой в Riva (`LINEAR_PCM` — единственный формат, подтверждённый живым тестом надёжным для всех источников); TTS-вывод (сырой PCM от Riva) транскодируется обратно в MP3 тем же способом, чтобы не менять контракт остального приложения (`media_ops/tasks.py` уже сохраняет `.mp3`).

**Побочный конфликт зависимостей**: `nvidia-riva-client` жёстко пинит `protobuf==6.33.5`, что несовместимо с `google-generativeai` (`google-ai-generativelanguage` требует `protobuf<6.0.0dev`) — математически неразрешимый конфликт в одном окружении. Решение (подтверждено пользователем): миграция Gemini-адаптера с deprecated `google-generativeai` на новый `google-genai` SDK (без прямой зависимости от protobuf вообще) — заодно устранило и официальный deprecation-warning ("all support has ended"). Это потребовало также поднять `openai` (1.51.0→1.109.1, чинит собственный баг с `proxies`) и `httpx` (0.27.2→0.28.1, `google-genai` требует `>=0.28.1`) — три пакета обновлены единым шагом, полный набор тестов (120→132 после Phase 13/14) зелёный.

**Инфраструктурный инцидент по пути**: несколько пересборок образов (ffmpeg + новые зависимости) исчерпали место на диске Docker Desktop (`PANIC: could not write to file ... No space left on device`) — Postgres упал в цикл паники/восстановления. Устранено `docker builder prune -af` (35GB build-cache, безопасно — не трогает именованные образы других проектов на этой машине) + перезапуск `db`/`web`/`worker`/`bot`. Данные не пострадали (WAL-восстановление Postgres сработало штатно после освобождения места).

Вся инфраструктура (биллинг, Celery, фронтенд, бот) полностью работает в реальном
(не mock) режиме для ASR/TTS. Исторический progression-гейт, существовавший на момент
этой проверки, выведен из продукта в пересмотре Phase 12 от 2026-07-27.

**Расширенная таксономия ("творческая студия для бизнеса")** — каталог NVIDIA NIM покрывает модальности за пределами текста/картинок; продукт растёт вширь по модальностям, каждая — со своим curation gate, а не общий список "90+ моделей":

| Модальность | Категории (задачи) | Кандидаты из каталога NVIDIA (build.nvidia.com/models) |
|---|---|---|
| Текст (уже реализовано, Phase 10) | hook, longform, hashtags, content_plan, repurpose, translation | OpenAI/Anthropic/Gemini (текущие) + Llama 4/3.3, Mistral Large/Medium, DeepSeek V4, Qwen3.5, Nemotron-3 — кандидаты на конкретные категории после оценки качества |
| Картинки (уже реализовано, Phase 10) | realistic, illustration | OpenAI/Flux (текущие) + FLUX 1/2 напрямую от NVIDIA, Stable Diffusion 3.5, Qwen-Image(-Edit) |
| Speech-to-text (новая) | `voice_to_text` — расшифровка голосовых заметок и диктовка в чат | nvidia/canary-1b-asr, nvidia/parakeet-* (мультиязычные), openai/whisper-large-v3 |
| Text-to-speech (новая) | `text_to_voice` — озвучка текста, документа или сценария | nvidia/magpie-tts-multilingual, nvidia/studiovoice, resembleai/chatterbox-multilingual-tts |
| OCR / парсинг документов (новая) | `document_to_text` — извлечение текста со скриншота/PDF для репурпоза | nvidia/nemotron-ocr-v2, nvidia/nemoretriever-parse, baidu/paddleocr |
| Content-safety (новая, усиливает существующую модерацию) | используется внутри `core/moderation.py`, не отдельная user-facing категория | nvidia/llama-guard-4-12b, nvidia/llama-3_1-nemoguard-8b-content-safety |

Узкоспециализированные научные и промышленные модальности каталога (биология/drug-discovery, симуляция, авто/робототехника, климат) не входят в текущий MVP: curation gate пока фокусируется на универсальных пользовательских и рабочих сценариях, а не на количестве моделей.

**Важно**: `voice_to_text`/`text_to_voice`/`document_to_text` — это НОВЫЕ для продукта модальности, требующие нового UI (запись/загрузка аудио, загрузка файлов на OCR), которого сегодня нет ни в вебе, ни в боте. Таксономия и раскладка моделей по категориям фиксируются здесь заранее, но код/эндпоинты/UI под них не создаются, пока не появится реальный API-ключ и рабочие модели — задел без работающей модели за ним является нерабочей заглушкой, а не заготовкой.

### Phase 12 — Base/Pro тариф — ПЕРЕСМОТРЕНО 2026-07-27
Игровая usage-based разблокировка выведена из продукта. Все категории задач и
инструменты доступны пользователю сразу. Ограничение тарифа действует только на
premium-модели; standard-модели должны позволять решить реальную задачу, а не служить
демо-заглушкой.

Исторические таблицы `UnlockableResource`, `UserUnlock`, `ModelUnlockable` и
`UserModelUnlock` пока не удаляются: каталог моделей продолжает использовать
`ModelUnlockable` как упорядоченный снимок маршрутов, а старые unlock-строки сохраняются
для обратимости и аналитики. `check_and_unlock()` стал compatibility no-op, UI прогресса
удалён.

**Acceptance**: Base-пользователь открывает любую категорию; auto-routing никогда не
вызывает premium-модель; явный premium-выбор возвращает 403
`model_requires_pro` без списания; Pro видит и использует весь каталог.

### Phase 13 — Recurring Pro-подписка — ✅ РЕАЛИЗОВАНО (2026-07-19/20)
Новая модель `billing.Subscription` (user, `yookassa_payment_method_id`, статус active/past_due/canceled, `current_period_end`, `price_rub`). `Payment` получил поле `kind` (topup/subscription) — единый вебхук `confirm_payment` (переименован из `confirm_topup`) разветвляется по нему после переподтверждения статуса у ЮKassa (та же анти-подделка логика, что и раньше).

**Механизм recurring**: первый платёж создаётся с `save_payment_method: true` (`billing/yookassa_client.py`) — ЮKassa возвращает переиспользуемый `payment_method.id`, привязывается к `Subscription` в момент успеха вебхука. Продление — `billing/tasks.py`'s `renew_subscriptions_task` (Celery Beat, ежедневно, `CELERY_BEAT_SCHEDULE`, новый docker-compose сервис `beat`) находит все `ACTIVE`-подписки с истёкшим `current_period_end` и списывает off-session через `charge_saved_payment_method` (без `confirmation`-блока — не требует захода пользователя). Неудача → `PAST_DUE` + даунгрейд `tier=FREE` немедленно (без grace-периода — упрощение, задокументировано в коде). Отмена пользователем (`cancel_subscription`) тоже даунгрейдит немедленно, а не ждёт конца оплаченного периода — то же упрощение ради ограничения объёма.

Эндпоинты: `GET/POST /api/billing/subscription/`, `/subscribe/`, `/cancel/`; бот-команды `/subscribe`, `/unsubscribe`; секция на `/pricing` (веб). Живой smoke-тест (`renew_due_subscriptions()` на реальной due-подписке без настоящих ЮKassa-кредов) подтвердил корректный путь отказа: `PAST_DUE` + `tier=free`.

**Acceptance**: ✅ подписка продлевается автоматически (Celery Beat, ежедневно); ✅ отмена обрабатывается (упрощённо — немедленный даунгрейд, не в конце периода); ✅ неудачный платёж помечает `past_due` и даунгрейдит; ✅ повторная доставка webhook не дублирует начисления (тот же idempotency-паттерн, что у top-up). 8 новых тестов в `billing/tests.py`, полный набор (120) зелёный после изменения.

### Phase 14 — Реферальная программа — ✅ РЕАЛИЗОВАНО (2026-07-19/20)
Новое приложение `referrals` (`Referral`: `referrer` FK, `referred` OneToOne — структурная гарантия "один реферал на аккаунт навсегда", `status` pending/rewarded). Код — просто `ref_<user.id>` (без отдельного поля/миграции); ссылка — `t.me/<TELEGRAM_BOT_USERNAME>?start=ref_<id>`.

**Момент начисления — только после первой реальной успешной генерации, не регистрации**: `referrals.services.check_referral_reward(user)` вызывается после каждого успешного chat/image/media-завершения (`providers/services.py` run_chat, `imagegen/tasks.py` `_succeed`, `media_ops/tasks.py`'s три completion-пути — тот же паттерн, что `progression.check_and_unlock`). Атомарный `filter(status=PENDING).update(status=REWARDED)` — compare-and-swap: пока нет PENDING-реферала, вызов не делает ничего, что естественно удовлетворяет "не начислять за одну регистрацию" без отдельного счётчика "первый ли это успех". Двусторонняя награда (`REFERRAL_REWARD_CREDITS`, по умолчанию 200 кредитов) обоим — рефереру и приглашённому — через существующий `billing.services.grant_credits`.

**Точки создания реферала** (только при первом контакте, не при повторном заходе — сам `Referral.referred` OneToOne это тоже гарантирует на уровне БД): бот `/start ref_<id>` (парсинг `CommandObject.args`, только если `created=True`), веб-регистрация — опциональное поле `referral_code` в `RegisterSerializer` + `?ref=` query-параметр на `/register` (веб-эквивалент deep-link для не-Telegram трафика).

Эндпоинт `GET /api/referrals/` — ссылка, код, статистика (invited/rewarded). Бот-команда `/invite`. Секция "Invite friends" на `/pricing` (copy-to-clipboard).

Живой E2E-тест через реальный API: регистрация реферера → регистрация приглашённого с `referral_code` → баланс рефереру не тронут (статус pending) → первый успешный (mock) chat-запрос приглашённого → оба баланса выросли на 200 кредитов, `rewarded_count` стал 1.

**Acceptance**: ✅ бонус не начисляется за одну регистрацию (подтверждено E2E); ✅ лимит на аккаунт структурный (OneToOneField), не просто проверка в коде — обойти невозможно без прямого доступа к БД. 9 новых тестов в `referrals/tests.py` + 3 в `bot/tests.py`, полный набор (132) зелёный.

### Расширение таксономии — фото-анализ (2026-07-20)
По запросу пользователя протестированы оставшиеся ~68 моделей каталога, ранее вообще не
тронутые (vision-модели, code-модели, general text). Из 26 живо протестированных — **2 рабочие**:
`nvidia/llama-3.1-nemotron-nano-vl-8b-v1` (vision-language, единственная рабочая vision-модель
из 8 протестированных) и `mistralai/mixtral-8x7b-instruct-v0.1` (general text). Все 7
протестированных code-моделей (starcoder2, codegemma×2, granite-code×2, codellama-70b,
codestral) дали 404 — **NVIDIA не провизионирует code-модели для этого аккаунта**, категория
"код" закрыта как неосуществимая, не как неисследованная.

**Новая категория продукта — "анализ фото" (`photo_to_caption`)**: отличается от OCR
(`document_to_text`, извлечение буквального текста с картинки) — модель описывает *содержимое*
фото как идею для подписи в соцсети, творчески, не дословно. Новое приложение внутри `media_ops`:
модель `PhotoAnalysis`, адаптер `media_ops/nvidia_vision_adapter.py`, эндпоинт
`POST /api/photos/analyze/`, страница `/analyze` (веб), команда `/describe` в боте (arm-паттерн:
следующее отправленное фото анализируется — реализовано через декларативный aiogram-фильтр
`_awaiting_photo_analysis`, зарегистрированный перед `on_photo_edit`/`on_document`, не через
ветвление внутри существующих хендлеров). Живой E2E-тест через реальный API подтвердил рабочий
цикл: pending → worker → ok, реальный (не mock) ответ с творческой подписью.

Итог полного цикла тестирования по каталогу: из 119 моделей протестировано ~90 (76%),
**35 подключены в продукт** (32 текста + 2 картинки + 1 vision-анализ), ~29 сознательно не
тронуты (embedding/safety/PII/video/finance-med/физика — не text-generation и/или нерелевантны).

### Добивка каталога до 100% + 2 находки внедрены (2026-07-20)
По запросу протестированы все оставшиеся ~29 моделей (embedding через настоящий Embeddings
API, safety/classifier через chat completions) — **весь каталог из 119 моделей теперь
протестирован полностью**. Найдено:

- **`nvidia/nemoretriever-parse` — исправлена прошлая ошибка тестирования, модель реально
  работает.** Прошлая запись "never resolved" была неверной: модель отвечает не в
  `message.content`, а через **tool call** (`markdown_bbox`), чьи JSON-аргументы — список
  страниц с блоками `{bbox, text, type}`. Дополнительно требует content ТОЛЬКО из
  `image_url`-блока — текстовая инструкция рядом с картинкой отклоняется ошибкой "Content
  cannot be a plain string". **OCR-адаптер переписан** (`media_ops/nvidia_ocr_adapter.py`)
  на эту модель вместо workaround через `meta/llama-3.2-11b-vision-instruct` — точнее (реальные
  bounding box, не пересказ), живой E2E-тест подтвердил корректное извлечение текста.
- **6 safety-классификаторов рабочие**: `meta/llama-guard-4-12b`, `nvidia/gliner-pii`,
  `nvidia/llama-3.1-nemoguard-8b-content-safety`, `-topic-control`,
  `nvidia/llama-3.1-nemotron-safety-guard-8b-v3`, `nvidia/nemotron-3.5-content-safety`.
  **Модерация усилена** (`core/moderation.py`): добавлен `nvidia/llama-3.1-nemoguard-8b-
  content-safety` как backstop-проверка, срабатывающая независимо от `OPENAI_API_KEY` —
  закрывает ровно ту дыру, что раньше была явно задокументирована в коде ("deployment без
  OPENAI_API_KEY не имеет реальной модерации, только regex"). Точная форма ответа для
  unsafe-случая не подтверждена живым тестом (только safe: `{"User Safety": "safe"}`) —
  проверка ищет подстроку `"unsafe"`, а не парсит строгую схему, специально defensively.
  Живой тест подтвердил: обычный безопасный промпт по-прежнему проходит модерацию нормально.
- 2 embedding-модели рабочие (`nvidia/nemotron-3-embed-1b` 2048 dims, `nvidia/nv-embed-v1`
  4096 dims) — не подключены, у продукта нет функции поиска/similarity под них.
- Подтверждено мёртвым: `google/deplot`, `google/diffusiongemma-26b-a4b-it`,
  `nvidia/nemotron-4-340b-reward`, `nvidia/ai-synthetic-video-detector`, все 3 Writer Palmyra
  (finance/med), ещё 9 embedding-моделей (404/провизионинг).

**Итог: 119/119 моделей каталога протестированы (100%). 36 подключены в продукт** (32 текста +
2 картинки + 1 vision-анализ + модерация усилена отдельным safety-классификатором, не
считается как "категория", но реально используется).

### Per-model выбор и тарифный доступ (2026-07-20, пересмотрено 2026-07-27)
Внутри текстовой категории (напр. `hook`) юзер теперь может явно выбрать конкретную модель
из списка `TASK_ROUTES[task]`, а не только получать auto-fallback по фиксированному порядку.
Применимо только к тексту — у картиночных категорий (`realistic`/`illustration`/`premium`/
`edit`) всегда ровно одна модель на категорию, выбирать там нечего.

**Схема**: `progression.ModelUnlockable` остаётся упорядоченным снимком
`TASK_ROUTES`, но поля старых порогов больше не определяют доступ. Политика вынесена в
`providers/access.py`: проверенные standard-модели перечислены явно, всё неизвестное по
умолчанию считается premium (fail closed).

**Выбор модели + fallback**: `run_chat(user, prompt, task, model=None)` — если `model` передан,
проверяется через единый entitlement contract; если разрешён — переставляется в начало
списка кандидатов, а остальной список остаётся как обычный fallback (если выбранная модель
падает, всё равно есть страховка в пределах доступного тарифа). Неизвестная модель даёт
400 `invalid_model`; premium-модель для Base — 403 `model_requires_pro`; ничего не
списывается.

**API**: `POST /api/chat/` принимает опциональное поле `model`; `GET /api/progress/models/<task>/`
отдаёт полный список кандидатов категории с `access_class=standard|premium` и
`unlocked` как текущим тарифным entitlement.

**Frontend**: `/chat` сохраняет Auto и явный выбор. Standard-модели доступны, premium
видны отдельной группой с подписью «Доступно в Pro», без счётчиков запросов/дней.

**Бот НЕ получил пикер**: он использует auto-routing, но тот же backend entitlement
исключает premium-модели для Base.

44 строки `ModelUnlockable` засеяны (по числу кандидатов во всех 6 текстовых категориях на
момент реализации). **Важно**: `TASK_ROUTES` и `ModelUnlockable` теперь два независимых
источника правды, которые нужно синхронизировать вручную — добавление новой модели в
`TASK_ROUTES` без соответствующей миграции в `progression` означает, что она никогда не
появится как выбираемая (это явно задокументировано в докстринге `ModelUnlockable`).

### Адаптивные темы по зонам (2026-07-20) — ✅ РЕАЛИЗОВАНО
4 зоны продукта (Desk/Studio/Voice booth/Archive, по route-префиксу) получили **сдержанный
hue-сдвиг** primary/accent + едва заметный (0.002–0.009 chroma) tint фона — не разные палитры.
Компромисс между запросом пользователя на "атмосферу по зонам" и уже задокументированным в
DESIGN.md принципом "Restraint reads as confidence" (явный anti-reference на цветовую пестроту
AI-playground'ов). `[data-zone]` CSS-переменные в `globals.css` + `components/zone.tsx`
(`ZoneScope`, client-компонент на `usePathname()`), обёрнут вокруг контента страниц, но НЕ
вокруг `<Nav>` — хедер остаётся нейтральным всегда, меняется только контент под ним. Живая
Playwright-проверка всех 5 маршрутов подтвердила: `data-zone` резолвится верно, визуально
различимо (тёплый оранжевый в Studio, сине-фиолетовый в Voice, приглушённый в Archive),
Desk (chat/history/pricing/login/register) не изменился вообще.

### Phase 15 — Единая навигация Chat / Agents / Knowledge / Studio
Один shell и одна информационная архитектура для web и Telegram Mini App. Главная
показывает сценарии по целям пользователя; прямой Chat с выбором модели остаётся
самостоятельным режимом, а не прячется внутри агентов.

**Acceptance**: один и тот же аккаунт и entitlement catalog на web/Mini App; все четыре
режима доступны из основной навигации; mobile safe areas, клавиатура и viewport не
перекрывают действия.

### Phase 16 — Agent Registry: мульти-доменный каталог, не одна SMM-вертикаль
Агент — версия конфигурации, а не строка промпта: slug, название, входная schema,
system instructions, workflow steps, model policy, tool policy, output schema,
версия, статус публикации и eval-набор (`agents.Agent`/`AgentRun`, уже реализовано
как generic-модель, не привязанная к конкретному сценарию). Первый агент
(«Контент на день для Threads») — уже реализован (коммит `8047ed7`) и остаётся как
есть, но **сознательно не является образцом всей категории**: продукт репозиционирован
как универсальный AI-агрегатор (SPEC.md "Что это", `2ca8dac`), поэтому каталог агентов
обязан отражать это на старте, а не только "докручиваться" позже.

**Категории каталога** (в UI Agent-раздела): Популярное · Контент · Финансы ·
Исследования · Документы · Видео · Автоматизации. Видео и Автоматизации — карточки-заглушки
до появления реальных провайдеров/движка (та же дисциплина "нет рабочей модели за
UI-заглушкой", что и в Фазе 11), остальные должны иметь минимум по одному рабочему
агенту к завершению этой фазы.

**Стартовый набор — минимум 3 агента из разных категорий** (не количество ради
количества, а минимально достаточное разнообразие, чтобы каталог не читался как
"контент-инструмент с парой довесков"):
1. Контент — «Контент на день для Threads» (готово).
2. Исследования — «Дайджест по теме»: веб-поиск → синтез с обязательным цитированием
   источников, режимы Speed/Balanced/Quality (паттерн из Perplexica/аналогов).
3. Документы — «Саммари документа + вопросы по содержимому», поверх уже рабочей
   OCR/vision-модальности (`document_to_text`, `media_ops/nvidia_ocr_adapter.py`,
   Фаза 11/20).

**Контекст пользователя** (не "бренд-профиль" — намеренно шире) — ✅ РЕАЛИЗОВАНО:
общий блок (тон, запрещённые темы) + опциональные доменные блоки (Контент:
ниша/аудитория/продукты/примеры; Исследования: темы/глубина; Документы: типичные
форматы). `accounts.UserContext` — одна модель, OneToOne к User (по образцу
`billing.CreditAccount`), одно JSON-поле `data`, а не отдельная таблица на
категорию. `GET/PUT /api/auth/context/`, страница `/profile`, ссылка в
`AccountMenu`. Подключено к движку агентов: `agents.tasks.run_agent()` читает
контекст один раз за run (не за шаг) и передаёт в `render_step_prompt()`
(`agents/services.py`), которая подмешивает общий блок + блок, совпадающий с
`agent.category`, отдельной секцией "Профиль пользователя" перед вводом формы;
пустой/отсутствующий контекст не меняет промпт ни на байт (проверено тестом на
байт-в-байт идентичность). Финансы/Видео-блоки пока не добавлены — то же правило
"нет блока без агента в этой категории", что и у вкладок каталога.

**Chat и Agent — независимые истории, общий аккаунт**: `AgentRun` (уже есть) и
чат-треды — разные модели данных и разные списки в UI (не одна объединённая лента).
Причина: у чата нет статуса выполнения, у агента нет свободного диалога — смешивание
только запутывает. Knowledge, баланс и общая история списаний остаются едиными на
уровне аккаунта.

**Инженерные заимствования** (см. сканирование референсов ниже) для движка агентов:
skill-routing (в контекст шага передаются только релевантные для него инструменты,
не весь `tool_policy` целиком) и версии инструкций в диффуемом, читаемом формате —
эволюция уже существующих `system_instructions`/`workflow_steps`, не новая
подсистема. MCP-совместимость для внешних инструментов — отложена до Фазы 17
(`tool_policy` уже зарезервирован под это).

**"Мои агенты" (лёгкий конструктор, отдельно и позже)**: пользователь комбинирует
2–3 уже одобренных шага из разных категорий через простую форму (не визуальный
граф — это ComfyUI-уровень сложности, не нужен нашей аудитории). Идёт **после**
того, как каталог из пункта выше стабилен и доказал качество — иначе повторяем
находку сканирования Abacus.AI: открытый конструктор быстро даёт "огромный и
перегруженный каталог" вместо кураторского.

**Acceptance**: пользователь видит минимум 3 категории с рабочим агентом внутри,
запускает любой из каталога, отвечает только на короткую форму (плюс уже сохранённый
Контекст пользователя, если есть), видит пошаговый статус, получает структурированный
результат; каждый run хранит версию агента, стоимость, выбранные модели и ошибки;
повторный запуск идемпотентен; история чатов и история агентов — раздельные списки.

**Референсы, изученные сканированием (2026-07-30, через Playwright MCP и WebFetch)**:
абакус.ai (структура Chat Mode/AI Agent/Knowledge, каталог AI Workflows, no-code
конструктор — источник самой идеи "мои агенты" и предостережения про перегруженный
каталог), AnythingLLM (workspaces как модель для Knowledge, skill-routing,
MCP-совместимость, cron-автоматизации), LibreChat (presets для Chat Mode,
SKILL.md-формат версий инструкций, code interpreter/artifacts, resumable streams),
ComfyUI (взяли только принцип "готовые шаблоны как отправная точка", не node-graph
редактор — не та аудитория), Perplexica (режимы Speed/Balanced/Quality и обязательное
цитирование источников — легли в агента "Дайджест по теме"), syntx.ai (валидация
Telegram-first, идея "Галерея" примеров как онбординг-элемент).

### Presets в Chat Mode — ✅ РЕАЛИЗОВАНО (2026-07-30)
Сохранённая пользователем связка (модель + task + системный промпт + temperature),
переключаемая прямо в диалоге без потери истории — по образцу LibreChat (их реальная
схема пресета подтверждена через документацию: `{title, model, promptPrefix,
temperature}`). `providers.Preset` — новая модель (не FK к треду: пресет резолвится
на фронтенде в `system`/`temperature` и уходит вместе с обычным per-message
model/task override, тем же механизмом, что уже существовал для ручного выбора
модели — никакой новой server-side связки с тредом не потребовалось).

**Системный промпт — новая возможность для всего чата, не только для агентов**: до
этой задачи ни `run_chat()`, ни один из 5 адаптеров провайдеров (OpenAI/Anthropic/
Gemini/NVIDIA/Search) не поддерживали system-параметр вообще — жёстко слали только
`messages=[{role:user}]`. Добавлено сквозным необязательным параметром через весь
стек: `ChatRequestSerializer` → `run_chat(system=, temperature=)` → каждый адаптер
(`system`/`temperature` передаются нативным для конкретного SDK способом: OpenAI/
NVIDIA — ведущее `{role:system}`-сообщение, Anthropic — top-level `system=`, Gemini —
`system_instruction=` в `GenerateContentConfig`, Search — форвардится во внутренний
вызов OpenAI-адаптера). Пусто/не передано — байт-в-байт то же поведение, что было
(закреплено регрессионными тестами на каждом уровне).

**Технический долг, вскрытый и закрытый по пути**: DRF не строит автоматический
`UniqueTogetherValidator` для `(user, name)`, если `user` не является полем
сериализатора — без `user = serializers.HiddenField(default=CurrentUserDefault())`
дубликат имени пресета падал 500-й `IntegrityError` с БД вместо чистого 400.

**Acceptance**: пользователь создаёт/переключает/удаляет пресеты из композера чата;
выбранный пресет применяется к следующему сообщению (модель, задача, системный
промпт, temperature); история треда не теряется при смене пресета; отправка без
пресета работает ровно как раньше.

### Phase 17 — Knowledge и безопасные действия агентов
Личные и командные источники знаний: загрузка, извлечение, chunking, embeddings,
поиск с обязательной проверкой tenant ownership. Агент может подключать разрешённые
источники. Любое внешнее действие (публикация, отправка, изменение стороннего ресурса)
проходит preview → явное подтверждение → execution с audit log.

**Уточнение от пользователя (2026-07-30)**: Knowledge должен выходить в навигацию не
просто отдельной страницей, а полноценным режимом верхнего уровня — переключатель
**Chat Mode | AI Agent | Company Knowledge**, один в один по механике с abacus.ai
(структура уже зафиксирована в памяти проекта при сканировании 2026-07-30). Категории
внутри AI Agent (Популярное/Контент/Исследования/Документы) уже сделаны в Phase 16 —
это не новая работа, а сам режим "Knowledge" как третий равноправный переключатель
рядом с Chat/Agent — то, чего не хватает. Именно этот переключатель, а не просто новая
страница `/knowledge`, и есть acceptance-критерий этой фазы по части навигации.

**Acceptance**: retrieval не пересекает аккаунты; источники можно подключить к чату и
агенту; prompt-injection evals и лимиты инструментов проходят; внешнее действие
невозможно выполнить без подтверждения пользователя.

**Slice 1 — ✅ РЕАЛИЗОВАНО (2026-07-30): личные workspace + retrieval.** Новое
приложение `knowledge`: `Workspace` (личная коллекция, без командных/shared —
в проекте нет модели организации вообще), `Source` (вставленный текст или
изображение — OCR переиспользует уже рабочий `media_ops.nvidia_ocr_adapter`, PDF
и произвольные форматы сознательно не входят, как и раньше для этой модальности),
`Chunk` (текстовый фрагмент + embedding). Эмбеддинги — новый `NvidiaEmbeddingAdapter`
(`nvidia/nemotron-3-embed-1b`, уже live-протестирована в Phase 11, но до сих пор не
подключена ни к одной функции) через тот же OpenAI-совместимый Embeddings API, что и
остальные NVIDIA-адаптеры. Косинусное сходство считается в Python/numpy на лету по
чанкам одного workspace — без pgvector и без смены образа Postgres (ожидаемый для MVP
размер корпуса не оправдывает эту инфраструктуру). Поиск (эмбеддинг запроса)
сознательно unbilled — тот же принцип, что у `providers.intent.classify_task`.
Раздел `/knowledge` в навигации (пока обычный пункт, не полноценный
Chat/Agent/Knowledge-переключатель — см. выше). **Ещё не сделано в рамках Phase 17**:
подключение workspace к чату/агенту (retrieval-augmented generation), сам
nav-уровневый переключатель режимов, безопасные внешние действия/audit log.
Backend 298→308 тестов зелёных; frontend 163→169.

## Внешние зависимости (нужны от пользователя по ходу фаз)
OpenAI API key, Anthropic API key, Google (Gemini) API key, image-провайдер API key, Telegram bot token (@BotFather), аккаунт ЮKassa (можно тестовый), опционально Sentry DSN, NVIDIA NIM API key (build.nvidia.com/models, Phase 11 — предоставлен, реально используется). `TELEGRAM_BOT_USERNAME` (Phase 14, для корректных `t.me/...`-ссылок в реферальной программе — сейчас пусто в `.env`, реферальные ссылки резолвятся в `t.me/?start=...` без имени бота, пока не заполнено).
