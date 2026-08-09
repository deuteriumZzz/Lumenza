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

Historical “before” screenshots retained separately from `approved/` so an old
implementation can never be confused with the redesign source of truth.

## Deterministic current capture and comparison

The active audit harness writes generated artifacts to the ignored
`frontend/test-results/visual-audit/` directory. It uses the approved images'
exact 1586 × 992 viewport, waits for the semantic route landmark and fonts,
disables nondeterministic transition time, captures the current screen, and
produces both pixel diffs and 50%-opacity overlays.

With the backend and frontend already running:

```
cd frontend
CAPTURE_BASE_URL=http://localhost:3100 \
LUMENZA_TEST_USERNAME=... \
LUMENZA_TEST_PASSWORD=... \
npm run audit:visual
```

The functional browser baseline uses the same route matrix and viewport:

```
E2E_SKIP_WEB_SERVER=true \
LUMENZA_TEST_USERNAME=... \
LUMENZA_TEST_PASSWORD=... \
npm run test:e2e
```

The credentials are environment-only and are never committed. See
`docs/LUMENZA_UI_AUDIT_2026-08-09.md` for the current metrics and findings.
