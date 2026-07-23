from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

DEV_INSECURE_SECRET_KEY = "dev-insecure-secret-key"
# .env.example содержит ещё один плейсхолдер ("change-me-in-production")
# в качестве шаблонного значения для тех, кто настраивает .env с нуля —
# проверка ниже должна ловить и его тоже, а не только код-уровневый
# дефолт, иначе деплой, который скопировал .env.example как есть и забыл
# заменить значение, «успешно» запустится на публично известном ключе.
KNOWN_INSECURE_SECRET_KEYS = {
    DEV_INSECURE_SECRET_KEY,
    "change-me-in-production",
}
SECRET_KEY = env("SECRET_KEY", default=DEV_INSECURE_SECRET_KEY)
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# Неправильно настроенный прод-деплой (SECRET_KEY не задан или оставлен
# шаблонным плейсхолдером) иначе запустился бы «успешно» с
# фиксированным, публичным, легко угадываемым ключом, на котором
# держится подпись сессий/токенов — лучше явно упасть при старте, чем
# незаметно работать в небезопасном режиме.
if not DEBUG and SECRET_KEY in KNOWN_INSECURE_SECRET_KEYS:
    raise RuntimeError(
        "SECRET_KEY must be set to a real value via the environment "
        "when DEBUG=False"
    )

INSTALLED_APPS = [
    # Должен идти первым — так Channels подменяет команду `runserver` на
    # свою ASGI-совместимую версию (сама команда используется только в
    # dev; прод идёт через daphne напрямую, см. docker-compose.yml).
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "core",
    "accounts",
    "billing",
    "providers",
    "imagegen",
    "bot",
    "progression",
    "media_ops",
    "referrals",
    "channels",
]

ASGI_APPLICATION = "lumenza.asgi.application"

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Отдаёт STATIC_URL напрямую из gunicorn — должен стоять сразу после
    # SecurityMiddleware, как того требует документация whitenoise.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # JSON request completion logs + correlation ID. Static files handled
    # above by WhiteNoise do not need to enter the application request log.
    "core.middleware.RequestLoggingMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "lumenza.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "lumenza.wsgi.application"
ASGI_APPLICATION = "lumenza.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="lumenza"),
        "USER": env("POSTGRES_USER", default="lumenza"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="lumenza"),
        "HOST": env("POSTGRES_HOST", default="db"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation." "MinimumLengthValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        )
    },
]

LANGUAGE_CODE = "ru"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    # Имена файлов с хэшем содержимого + gzip/brotli-сжатие заранее,
    # отдаётся через WhiteNoiseMiddleware — здесь меняется только ключ
    # "staticfiles", "default" — стандартное поведение Django.
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Собственный дефолт Django (2.5 МБ) не ограничивает multipart-части
# файла, только не-файловые POST-данные — реальное ограничение размера
# загружаемых файлов задают валидаторы на уровне полей в
# media_ops/serializers.py и imagegen/serializers.py
# (core.validators.max_upload_size). Здесь значение задано явно,
# совпадает с самым большим лимитом на поле (25 МБ, аудио) — порог
# буферизации в память/на диск становится осознанным выбором, а не
# молчаливым дефолтом Django.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # Аутентификация через cookie для веб-фронтенда — см.
        # accounts/authentication.py. TokenAuthentication (заголовок)
        # остаётся как запасной вариант для инструментов/эксплуатации
        # (curl, токены, выданные через admin) — фронтенд вообще никогда
        # не видит значение токена, так что убирать этот класс отсюда
        # не добавило бы защиты.
        "accounts.authentication.CookieTokenAuthentication",
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        "sandbox_topup": "5/min",
        "topup": "5/min",
        "subscription": "5/min",
        "chat": "60/min",
        "image_generation": "20/min",
        "media_ops": "20/min",
    },
}

# Без этого Django откатывается на LocMemCache в рамках одного процесса
# — при работе под gunicorn/несколькими воркерами (или несколькими
# контейнерами) это значит, что у каждого процесса свой кэш, что
# незаметно ломает все throttle-лимиты DRF (DEFAULT_THROTTLE_RATES выше)
# и лимит частоты для вебхука YooKassa, поскольку каждый воркер видит
# только свою часть запросов. Указываем на тот же Redis, что уже
# используется для Celery, — тогда throttling реально общий для всех
# воркеров.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("CACHE_URL", default="redis://redis:6379/1"),
    }
}

# --- Усиление безопасности cookie / CSRF / транспорта ---

# Cookie с токеном авторизации DRF — выставляется в accounts/views.py на
# login/register, читается в
# accounts/authentication.py.CookieTokenAuthentication.
# httponly=True (всегда) — и есть весь смысл этой миграции: токен
# никогда не читается из JS, поэтому его нельзя украсть через
# XSS-пейлоад или вредоносное расширение браузера так, как это было
# возможно с токеном в localStorage.
AUTH_TOKEN_COOKIE_NAME = "lumenza_token"
AUTH_TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 дней

# SameSite=Lax безопасен без всяких условий (не зависит от наличия TLS)
# и блокирует отправку cookie при межсайтовых POST-запросах — но
# реальная защита от CSRF всё равно основана на токене Django
# (CsrfViewMiddleware, CookieTokenAuthentication._enforce_csrf), это
# лишь дополнительный слой.
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# Прокси фронтенда (proxy.ts) пробрасывает /api/* на этот Django-бэкенд
# на стороне сервера (NextResponse.rewrite), поэтому реальный заголовок
# Origin от браузера всегда отражает origin ФРОНТЕНДА (например
# http://localhost:3000) — никогда собственный хост Django. Проверка
# CSRF в Django по умолчанию сверяет Origin с собственной схемой+хостом
# и иначе отклоняет каждый реальный браузерный POST/PUT/PATCH/DELETE
# (подтверждено вживую: curl не отправляет Origin, поэтому этот пробел
# был не виден до теста в настоящем браузере). Перечисляем здесь каждый
# origin фронтенда, за которым стоит этот бэкенд.
CSRF_TRUSTED_ORIGINS = env.list(
    "PUBLIC_FRONTEND_ORIGINS", default=["http://localhost:3000"]
)

# Cookie с флагом `Secure` браузер вообще отказывается принимать по
# простому HTTP — включать это можно только когда перед бэкендом реально
# стоит TLS-терминирующий reverse-прокси (nginx/Caddy/балансировщик), а
# в этом репозитории такого пока нет нигде. Завязывать это только на
# `not DEBUG` было бы неправильно: деплой с `DEBUG=False` вполне может
# быть чисто HTTP-only (например, за VPN, или пока ещё не выпущен
# реальный TLS- сертификат) — и тогда это незаметно сломает вообще весь
# логин. Та же логика для HSTS (говорит браузеру целый год отказываться
# от HTTP — это реально вредно, если HTTPS ещё не работает) и для
# SSL-редиректа (нужен SECURE_PROXY_SSL_HEADER, настроенный на заголовок
# реального прокси о протоколе). Включайте TLS_TERMINATED только когда
# эта инфраструктура действительно появится.
TLS_TERMINATED = env.bool("TLS_TERMINATED", default=False)
SESSION_COOKIE_SECURE = TLS_TERMINATED
CSRF_COOKIE_SECURE = TLS_TERMINATED
if TLS_TERMINATED:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env(
    "CELERY_RESULT_BACKEND", default="redis://redis:6379/0"
)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
# Celery otherwise removes the root handlers configured by Django and
# replaces the JSON formatter with its own human-oriented formatter.
CELERY_WORKER_HIJACK_ROOT_LOGGER = False
# Тесты включают этот флаг (через override_settings), чтобы задачи
# выполнялись синхронно, в том же процессе, без брокера/воркера.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = True

# Ежедневный проход, который списывает средства по каждой
# подписке, у которой current_period_end уже прошёл
# (billing.tasks.renew_subscriptions). Обычное расписание прямо в коде
# (а не хранимое в БД расписание django_celery_beat) достаточно для
# одной фиксированной ежедневной задачи — редактируемое через admin
# расписание пока не нужно.
CELERY_BEAT_SCHEDULE = {
    "renew-subscriptions-daily": {
        "task": "billing.renew_subscriptions",
        "schedule": 86400.0,
    },
}

# --- Провайдеры / биллинг ---
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
GOOGLE_API_KEY = env("GOOGLE_API_KEY", default="")
REPLICATE_API_TOKEN = env("REPLICATE_API_TOKEN", default="")
NVIDIA_API_KEY = env("NVIDIA_API_KEY", default="")
TAVILY_API_KEY = env("TAVILY_API_KEY", default="")

# 1 кредит = $0.001 себестоимости у провайдера (до наценки).
CREDIT_USD_VALUE = env.float("CREDIT_USD_VALUE", default=0.001)
# Применяется поверх сырой стоимости провайдера перед конвертацией в
# кредиты.
PROVIDER_MARKUP = env.float("PROVIDER_MARKUP", default=1.3)
# Приветственные кредиты при регистрации (~$0.50 использования при
# дефолтной наценке).
SIGNUP_BONUS_CREDITS = env.float("SIGNUP_BONUS_CREDITS", default=500)
# Двусторонний реферальный бонус (и пригласивший, и приглашённый
# получают столько кредитов), выдаётся, когда приглашённый пользователь
# завершает свою первую реальную успешную генерацию — см.
# referrals/services.py check_referral_reward.
REFERRAL_REWARD_CREDITS = env.float("REFERRAL_REWARD_CREDITS", default=200)

# --- Telegram-бот ---
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
# Собственный @username бота (без ведущего @) — нужен, чтобы строить
# t.me-ссылки для приглашений (referrals/services.py referral_link_for),
# поскольку сам токен бота не позволяет получить username без
# дополнительного запроса к API.
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", default="")
# Используется для построения абсолютных URL медиа для Telegram-метода
# sendPhoto (серверы Telegram сами загружают файл по URL, поэтому он
# должен быть публично доступен — в реальном деплое здесь нужен
# настоящий домен, а не дефолтный localhost для разработки).
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", default="http://localhost:8000")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", default="")
# Публичный HTTPS-URL фронтенда (не бэкенда — PUBLIC_BASE_URL выше это он),
# который Telegram откроет как Mini App — оставить пустым, чтобы не
# показывать кнопку "Open App"/меню до того, как это будет настоящий
# HTTPS-домен, зарегистрированный в BotFather (/newapp), иначе
# WebAppInfo с пустым/localhost URL сломала бы саму отправку /start.
MINI_APP_URL = env("MINI_APP_URL", default="")

# Sandbox-эндпоинт пополнения баланса начисляет кредиты без реальной
# оплаты за ними — заглушка на месте настоящей интеграции YooKassa. По
# умолчанию включён только при DEBUG, чтобы неправильно настроенный
# прод-деплой (DEBUG не задан/False) не открыл его случайно; никогда не
# форсировать True вне локальной разработки/дев-окружения.
SANDBOX_TOPUP_ENABLED = env.bool("SANDBOX_TOPUP_ENABLED", default=DEBUG)

# --- Structured logging ---

LOG_LEVEL = env("LOG_LEVEL", default="INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {
            "()": "core.logging.RequestContextFilter",
        }
    },
    "formatters": {
        "json": {
            "()": "core.logging.JsonFormatter",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["request_context"],
            "formatter": "json",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "lumenza.request": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

# --- YooKassa (реальное пополнение) ---
YOOKASSA_SHOP_ID = env("YOOKASSA_SHOP_ID", default="")
YOOKASSA_SECRET_KEY = env("YOOKASSA_SECRET_KEY", default="")
# 1 кредит = столько рублей, независимо от CREDIT_USD_VALUE
# (ценообразование в реальных рублях против учёта себестоимости
# провайдера в долларах) — избавляет от привязки цены пополнения к
# текущему курсу валют для MVP.
CREDIT_RUB_VALUE = env.float("CREDIT_RUB_VALUE", default=0.1)
# Фиксированная ежемесячная цена за постоянный Pro-доступ
# (мгновенный, без набивания разблокировок моделей). Число не проверено
# рынком, тот же дух временного значения, что и у TODO по ценам NVIDIA
# в других местах.
PRO_SUBSCRIPTION_PRICE_RUB = env.float(
    "PRO_SUBSCRIPTION_PRICE_RUB", default=990.0
)
