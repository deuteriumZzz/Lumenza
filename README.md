# Lumenza

Telegram-first AI-агрегатор (MVP). Backend: Django + DRF, Postgres, Redis, Celery.
Полная спецификация — см. `SPEC.md`.

## Локальный запуск

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8000/health/
- Django admin: http://localhost:8000/admin/
