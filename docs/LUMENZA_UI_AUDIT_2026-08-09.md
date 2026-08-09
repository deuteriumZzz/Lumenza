# Lumenza UI audit — 2026-08-09

## Scope and source of truth

This is the independent pre-redesign audit for the six authenticated product
surfaces defined by the approved 1586 × 992 screenshots:

| Surface | Route | Approved reference |
|---|---|---|
| Chat | `/chat` | `docs/redesign-references/approved/chat.png` |
| Agents | `/agents` | `docs/redesign-references/approved/agents.png` |
| Studio | `/studio` | `docs/redesign-references/approved/studio.png` |
| Account | `/profile` | `docs/redesign-references/approved/account.png` |
| Knowledge | `/knowledge` | `docs/redesign-references/approved/knowledge.png` |
| All Tools | `/tools` | `docs/redesign-references/approved/all-tools.png` |

The screenshots, `PRODUCT.md`, and `DESIGN.md` supersede the previous visual
direction. Existing UI is evidence to audit, not a design source to preserve,
except for explicitly approved Chat and Agents Lumenza motion.

## Executive verdict

The application is functionally reachable and has a sound authenticated shell,
but it is not yet a pixel-equivalent implementation of the approved redesign.
Chat is the closest surface. Studio is the largest outlier and should be rebuilt
before final polish. The product also contains several controls that imply
capability without completing the corresponding action or persistence.

There are no P0 blockers in the six audited routes. The P1 issues below must be
resolved before the interface can be described as complete.

## Automated functional baseline

The deterministic Playwright audit runs Chromium at exactly 1586 × 992 with
Russian locale, Asia/Makassar timezone, reduced motion, seeded authentication,
and production-like routing. It verifies every approved route for:

- its semantic route landmark;
- accessible names on every visible button;
- real `href` values on every visible link;
- absence of horizontal page overflow;
- absence of unhandled page errors, unexpected console errors, and HTTP 5xx.

Result: all six routes pass in one authenticated browser journey.

This proves route integrity and a minimum interaction contract. It does not prove
that every business action reaches a real backend or that the visual design is
correct; those findings are tracked separately below.

Dependency gate: `npm audit --audit-level=high` passes with no high or critical
findings. Two moderate PostCSS advisories remain inside the pinned Next 16.2.12
dependency tree. The offered automatic fix upgrades Next outside the declared
range to 16.3.0, so it is deliberately deferred to a separately tested framework
upgrade rather than forced into this audit commit.

## Pixel-diff baseline

Comparison uses RGBA images at 1586 × 992 and counts a pixel as changed when its
largest RGB channel delta exceeds 16. Generated current, diff, overlay, capture,
and JSON reports are deliberately ignored by Git and can be regenerated locally.

| Rank | Surface | Changed pixels | Changed ratio | Mean channel delta |
|---:|---|---:|---:|---:|
| 1 | Chat | 341,098 | 21.68% | 12.87 |
| 2 | Account | 368,481 | 23.42% | 16.71 |
| 3 | Agents | 379,371 | 24.11% | 15.60 |
| 4 | All Tools | 459,668 | 29.22% | 17.83 |
| 5 | Knowledge | 510,579 | 32.45% | 17.49 |
| 6 | Studio | 813,672 | 51.72% | 29.48 |

The ratio is a regression signal, not a standalone aesthetic score. Font
rasterization and live content can move individual pixels, so overlays remain
part of acceptance. A route is accepted only when both its diff metrics and the
human overlay review satisfy the tolerances in the completion master plan.

## Findings by severity

### P1 — blocks product completeness

1. Apps and Community appear as global navigation destinations but resolve to
   Studio query views. They cannot own the global active state, so the shell does
   not accurately communicate location.
2. Studio cards labelled “Soon” or “Preview” are still selectable. Availability
   labels and interaction contracts disagree.
3. Studio exposes generation settings that are not submitted to the generation
   API. The UI therefore promises control that the generated result does not use.
4. `/voice` and `/videos` redirect to the default Studio image mode and discard
   the user's stated intent.

### P2 — material usability or consistency issue

1. Studio's `view=tools` state exists but is not reachable through the normal
   product navigation.
2. Tool favourites persist only in local browser state and are not account data.
3. `/chat/[threadId]` accepts a non-numeric segment and passes `NaN` downstream
   instead of showing a safe not-found or validation state.
4. The All Tools inspector is permanently open and offers neither a close control
   nor an Escape-key path.

### P3 — verification debt

1. Login, registration, legal, and legacy redirect routes do not have complete
   browser-level regression coverage.
2. Responsive checks are concentrated at the approved desktop viewport. Existing
   narrow-screen checks are mostly structural rather than visual.
3. The full Vitest suite can slow under concurrent workers; its worker and timeout
   policy should be made deterministic in CI.

## Surface-specific visual diagnosis

### Chat

Closest to the approved composition. Preserve the central Lumenza identity and
the Chat-to-Agents continuity, then correct spacing, type scale, provider-picker
assets, and state transitions against the overlay.

### Agents

The network composition is cropped toward the right, only part of the intended
node field is visible, the hero typography is too heavy, and the lower composer
and categories are clipped at the approved viewport. Rebuild the spatial layout
before tuning animation.

### Studio

The current gallery relies on blurred placeholder orbs rather than reference-
quality work, and the bottom prompt dock is not fully present in the viewport.
Preview-labelled modes and generation settings also overstate functionality.
This surface needs structural reconstruction, not incremental decoration.

### Account

Pet previews are flat, static glyphs. The approved experience calls for a
purposeful 2.5D companion with explicit idle, thinking, typing, success, error,
and sleeping states, plus a reduced-motion alternative. Account hierarchy and
spacing also require alignment to the reference.

### Knowledge

The import affordance dominates the first viewport and pushes the library table
and inspector below the intended composition. Rebalance hierarchy around the
existing collection and progressive import flow.

### All Tools

The broad layout is comparatively close, but the inspector behaves as a fixed
region rather than a controllable detail surface. Favourite state and keyboard
dismissal need real product semantics.

## Impeccable / anti-slop scorecard

| Category | Score | Evidence |
|---|---:|---|
| Accessibility | 3/4 | Semantic route landmarks, named controls, skip/focus/reduced-motion work exist; keyboard and screen-reader journeys are not yet fully audited. |
| Performance | 2/4 | Production build is healthy, but the visual layer still carries many filters and gradient operations and lacks a measured animation budget. |
| Responsive | 2/4 | Breakpoints exist; the approved desktop viewport is automated, while compact/tablet visual baselines are incomplete. |
| Theming | 2/4 | New canonical tokens exist, but legacy component values and effects still bypass them. |
| Anti-pattern resistance | 1/4 | Current CSS contains 52 gradient declarations, 36 backdrop filters, eight box-shadow declarations, and a clipped gradient-text treatment. |
| **Total** | **10/20** | **Acceptable functional baseline; redesign and hardening required.** |

Positive evidence: the codebase contains no `transition: all` declarations in
the audited global/component styles and includes several explicit
`prefers-reduced-motion` branches. These should remain invariants.

## Required remediation order

1. **Clarify and distill:** remove misleading availability and dead-end states;
   fix the navigation model and route intent.
2. **Layout and typeset:** rebuild the six reference compositions at 1586 × 992,
   beginning with Studio, Knowledge, and Agents.
3. **Colorize and quieter:** migrate remaining visual values to the Luminous
   Command Deck tokens; reduce decorative gradients, blur, and indiscriminate
   translucency.
4. **Craft and bolder:** restore hierarchy through scale, whitespace, authentic
   assets, and one focal moment per surface rather than added ornament.
5. **Animate and delight:** implement named, state-driven Lumenza and pet motion;
   use transforms and opacity, interruptible transitions, and reduced-motion
   fallbacks.
6. **Harden and adapt:** validate route parameters, persist account-scoped state,
   complete keyboard paths, and add compact/tablet browser baselines.
7. **Optimize and live:** measure animation/frame cost, stabilize CI workers,
   exercise real backend actions, then rerun pixel and functional audits.
8. **Polish:** final 50% overlays, motion review, accessibility pass, production
   build, security review, and six-screen acceptance record.

## Reproduction

From `frontend/`, with the backend and authenticated frontend running:

```bash
LUMENZA_TEST_USERNAME=... LUMENZA_TEST_PASSWORD=... npm run test:e2e
CAPTURE_BASE_URL=http://localhost:3100 LUMENZA_TEST_USERNAME=... LUMENZA_TEST_PASSWORD=... npm run audit:visual
```

Artifacts are written under `frontend/test-results/visual-audit/`:

- `current/` — current route captures;
- `diff/` — changed pixels highlighted in pink;
- `overlay/` — approved reference with the current image at 50% opacity;
- `capture-report.json` — route capture and browser error log;
- `report.json` — exact pixel metrics.

## Phase 3 design-foundation checkpoint

After applying the canonical palette, measured 262px sidebar, Cyrillic Geist,
flat shell surfaces, unified navigation geometry, and lower-cost route motion,
the same production audit was rerun at 1586 × 992:

| Surface | Baseline | Phase 3 | Change |
|---|---:|---:|---:|
| Chat | 21.68% | 22.35% | +0.67 pp |
| Agents | 24.11% | 21.70% | −2.41 pp |
| Studio | 51.72% | 48.25% | −3.47 pp |
| Account | 23.42% | 29.11% | +5.69 pp |
| Knowledge | 32.45% | 30.60% | −1.85 pp |
| All Tools | 29.22% | 22.74% | −6.48 pp |

Four of six routes improved and the unweighted mean changed-pixel ratio fell
from 30.43% to 29.12%. Chat and Account increased because the shared sidebar,
canonical colors, and Russian font geometry moved before their route-specific
compositions were rebuilt. They remain explicit work for their later screen
phases; the canonical foundation is not reverted to optimize a legacy layout.

The new shell-level E2E gate additionally proves exact 262 × 992 sidebar
geometry, canonical computed colors, no sidebar blur/shadow, a 58px active row,
reduced-motion state, and preservation of the same sidebar DOM node during the
client-side Chat → Agents transition.
