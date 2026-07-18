from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env("SECRET_KEY", default="dev-insecure-secret-key")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
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
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
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
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
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
        "chat": "60/min",
        "image_generation": "20/min",
    },
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
# Tests flip this on (via override_settings) to run tasks synchronously,
# in-process, without needing a broker/worker.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = True

# --- Providers / billing ---
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
GOOGLE_API_KEY = env("GOOGLE_API_KEY", default="")
REPLICATE_API_TOKEN = env("REPLICATE_API_TOKEN", default="")

# 1 credit = $0.001 of underlying provider cost (before markup).
CREDIT_USD_VALUE = env.float("CREDIT_USD_VALUE", default=0.001)
# Applied on top of raw provider cost before converting to credits.
PROVIDER_MARKUP = env.float("PROVIDER_MARKUP", default=1.3)
# Welcome credits granted on signup (~$0.50 of usage at default markup).
SIGNUP_BONUS_CREDITS = env.float("SIGNUP_BONUS_CREDITS", default=500)

# --- Telegram bot ---
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
# Used to build absolute media URLs for Telegram's sendPhoto (Telegram's
# servers fetch the URL themselves, so it must be publicly reachable — a
# real deployment needs a real domain here, not the localhost dev default).
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", default="http://localhost:8000")
TELEGRAM_WEBHOOK_SECRET = env("TELEGRAM_WEBHOOK_SECRET", default="")

# Sandbox top-up endpoint mints credits with no real payment behind them —
# a stand-in for Phase 6's real YooKassa integration. Defaults to DEBUG so a
# misconfigured prod deploy (DEBUG unset/False) can't expose it by accident;
# never force this True outside local/dev environments.
SANDBOX_TOPUP_ENABLED = env.bool("SANDBOX_TOPUP_ENABLED", default=DEBUG)

# --- YooKassa (Phase 6 real top-up) ---
YOOKASSA_SHOP_ID = env("YOOKASSA_SHOP_ID", default="")
YOOKASSA_SECRET_KEY = env("YOOKASSA_SECRET_KEY", default="")
# 1 credit = this many RUB, independent of CREDIT_USD_VALUE (real-money RUB
# pricing vs. the USD-denominated provider-cost accounting) — avoids tying
# top-up pricing to a live FX rate for an MVP.
CREDIT_RUB_VALUE = env.float("CREDIT_RUB_VALUE", default=0.1)
