# Lumenza — spec

## Что это
Telegram-first AI-агрегатор (аналог SYNTX.AI, суженный под нишу) для SMM/контент-креаторов: посты, репурпоз текста, картинки к постам, контент-план. Веб-кабинет — оплата, история, баланс. Telegram-бот — основной канал использования.

## Explicitly out of scope (MVP)
- Видео-генерация (Sora/Veo/Kling-подобные)
- Музыка (Suno-подобные)
- "90+ инструментов" — только 3 текстовых провайдера + 2 image-провайдера
- Крипто-платежи, мультивалютность
- OpenRouter (добавляется позже как fallback-слой)

## Архитектура
- **Backend**: Django + DRF, Postgres, Celery + Redis (долгие задачи — генерация картинок)
- **Frontend**: Next.js (React), дизайн — Impeccable + Anti-Slop (design-taste-frontend) как база;
  - лендинг: + FRESHTECHBRO 3D (react-three-fiber/threejs-webgl/lightweight-3d-effects) + animated-component-libraries (Magic UI/React Bits)
  - продуктовый UI (чат/кабинет): + emil-design-eng (сдержанная физичная микро-анимация, без 3D)
  - админка: стандартный Django admin, минимальный полиш, без 3D
- **Telegram bot**: aiogram (Python), общий API с вебом, общий аккаунт/баланс
- **Providers layer** (адаптеры, единый интерфейс):
  - Текст: OpenAI, Anthropic, Google Gemini
  - Картинки: OpenAI Images + Replicate/Flux (второй провайдер)
- **Routing**: статическая таблица режимов "быстро/умно/дёшево/картинки" → конкретные модели, fallback при отказе провайдера
- **Billing**: внутренний кредитный леджер (таблица движений: начисление/списание, provider cost * markup), топ-ап через ЮKassa (RU/CIS)
- **Observability**: `RequestLog` (provider, cost, latency, status) на каждый вызов провайдера с первого дня — основа админ-дэшборда маржи
- **Antiabuse**: rate-limit (DRF throttling / django-ratelimit), moderation prefilter на промпты (regex + moderation endpoint провайдера), дневные лимиты по тарифу

## Юридический риск (учитывать при работе с провайдерами)
Usage Policies OpenAI/Anthropic/Google запрещают чистый resell голого API-доступа как конкурирующего сервиса без добавленной ценности. Продукт должен явно добавлять ценность через сценарии (контент-план, шаблоны постов), а не быть голой прокси-обёрткой.

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
4. **Маркетинговый аудит**: `ecc:marketing-campaign`/`ecc:product-lens` относительно позиционирования "AI-комбайн для SMM/контент-креаторов"

Находки фиксятся → цикл повторяется, пока все 4 проверки не пройдут чисто.

## Внешние зависимости (нужны от пользователя по ходу фаз)
OpenAI API key, Anthropic API key, Google (Gemini) API key, image-провайдер API key, Telegram bot token (@BotFather), аккаунт ЮKassa (можно тестовый), опционально Sentry DSN.
