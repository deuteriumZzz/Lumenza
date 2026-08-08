# Redesign reference images

Single visual source of truth for the pixel-perfect redesign initiative
(`docs/LUMENZA_PIXEL_PERFECT_REDESIGN_PLAN.md`). Per that doc's §3
methodology, every screen's implementation is compared against its
matching image here via a 50%-opacity overlay until it's within the
tolerances in §19 — never implemented "from memory."

## `approved/` — the 6 references

| File | Screen |
|---|---|
| `chat.png` | Chat |
| `agents.png` | Agents |
| `studio.png` | Studio |
| `account.png` | Account / Profile |
| `knowledge.png` | Knowledge |
| `all-tools.png` | All Tools |

**Actual pixel dimensions**: 1586 × 992 (confirmed via `sips`), close to
but not exactly the doc §6 control viewport of 1600 × 1000 — use
1586 × 992 as the real capture viewport for overlay comparisons, since
matching the reference's actual pixels takes precedence over the doc's
rounded figure.

**Provenance**: received as local file paths from the user
(`~/Desktop/Chat.png`, `Agents.png`, `Studio.png`, `Account.png`,
`Knowledge.png`, `All Tools.png`), originally saved there 2026-08-02
during an earlier redesign-scoping session referenced in project memory
(`project_redesign_phase2`). Copied into this directory 2026-08-04.

## `baseline/`

"Before" screenshots of the *current* live app at the same routes,
captured via `frontend/scripts/capture-reference-screenshots.mjs`
(added in Phase 0/1 of this initiative) — kept separate from `approved/`
so the old-app baseline is never confused with the new-design source of
truth. Regenerate any time with:

```
docker run --rm \
  -v /Users/deuterium/Dev/Lumenza/frontend:/app -w /app \
  -e LUMENZA_TEST_USERNAME -e LUMENZA_TEST_PASSWORD \
  -e LUMENZA_API_ORIGIN=http://host.docker.internal:8000 \
  -e LUMENZA_ALLOW_HTTP_LOCALHOST=true \
  -e PORT=3000 \
  --add-host=host.docker.internal:host-gateway \
  node:22-bookworm bash -lc "
    npm ci &&
    npx playwright install --with-deps chromium &&
    npm run dev & \
    npx wait-on http://127.0.0.1:3000 -t 60000 &&
    node scripts/capture-reference-screenshots.mjs &&
    kill %1
  "
```

(`LUMENZA_API_ORIGIN` is read by both `server.js`'s WS proxy and
`src/proxy.ts`'s `/api` proxy — confirmed via source, not the
`NEXT_PUBLIC_*`-style var an earlier draft of this recipe guessed. The
dev server is a custom `server.js` reading `PORT` from the environment,
not a `next dev --port` flag.)

Requires the backend stack up (`docker compose up -d web db redis`) and
a seeded test account.
