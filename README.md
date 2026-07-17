# Lumenza

Telegram-first AI-агрегатор (MVP). Backend: Django + DRF, Postgres, Redis, Celery.
Полная спецификация — см. `SPEC.md`.

## Локальный запуск

### Backend

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8000/health/
- Django admin: http://localhost:8000/admin/

### Frontend

Requires the backend running (above) — the frontend proxies `/api/*` to it via
`src/proxy.ts`.

```bash
cd frontend
npm install
npm run dev
```

- Web app: http://localhost:3000
