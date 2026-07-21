# Design

## Mood

A bespoke instrument, not a playground: brushed brass fittings on dark walnut, quiet
confidence, nothing loud. The workspace should feel like something a professional pays
for and trusts with client work — closer to a precision trading terminal or a
well-made hardware tool than a chat toy.

## Color Strategy

**Restrained**: a near-black neutral surface carries the interface; one warm brand
accent (brushed brass/copper) marks primary actions and brand moments; a cool
counter-accent (verdigris) marks secondary state (links, informational badges). Neither
accent floods the surface — the mood lives in typography, spacing, and precision, not
in color coverage. This deliberately avoids both the cream/beige SaaS-dashboard default
and the purple-on-white AI-tool default named in PRODUCT.md's anti-references.

```css
:root {
  /* bg: pure near-black, zero chroma — the surface stays out of the way */
  --color-bg: oklch(0.09 0 0);
  /* surface: bg pulled toward ink ~15%, same neutral family, faint brass warmth */
  --color-surface: oklch(0.16 0.004 60);
  --color-surface-raised: oklch(0.21 0.005 60);
  /* ink: body text, ≥7:1 against bg */
  --color-ink: oklch(0.94 0.006 60);
  /* muted: secondary text, ≥3.5:1 against bg */
  --color-muted: oklch(0.64 0.012 60);
  /* primary: brushed brass/copper — CTAs, active states, credit/charge emphasis */
  --color-primary: oklch(0.70 0.14 57);
  --color-primary-ink: oklch(0.12 0.01 57); /* text-on-primary alt for pale tints only */
  /* accent: verdigris — links, info badges, "used fallback" / secondary status */
  --color-accent: oklch(0.72 0.11 200);
  /* semantic status, kept in the same restrained system */
  --color-success: oklch(0.72 0.14 152);
  --color-danger: oklch(0.63 0.19 25);
  --color-border: oklch(0.28 0.006 60);
}
```

Text-on-fill rule (both primary and accent sit in the saturated mid-luminance band):
**white/near-white text on filled primary and accent surfaces**, always — never dark
text on these fills, per the Helmholtz–Kohlrausch guidance. Dark text is reserved for
pale tints (L > 0.85) only, e.g. a light primary-tinted badge background.

## Typography

Single family, weight-driven hierarchy — a second display face would read as
decorative and undercut "restraint reads as confidence." Use the already-bundled
Geist Sans (`--font-geist-sans`) for all UI text; weight 400 for body, 550–650 for
emphasis/headings, never beyond 700 (a shouting heading contradicts the mood).

Numeric values that represent money or usage — credit balances, `credits_charged`,
token counts, latency — render in **Geist Mono** (`--font-geist-mono`) with tabular
figures. This is the one deliberate typographic signal of precision/instrumentation
that fits "cost and state are never hidden": numbers should visually read as
measurements, not as prose.

- Body line length: cap at 65–75ch (chat messages, history rows).
- Display ceiling: this register rarely needs a hero size; largest heading (page title)
  ≤ 2.25rem / 36px, weight 600.
- `text-wrap: balance` on page/section headings; `text-wrap: pretty` on longer chat text.

## Layout

No card grids as default scaffolding — the anti-reference list specifically flags the
SaaS-dashboard card cliché. Concretely:

- **Chat**: single focused column, max-width ~72ch, messages as plain alternating
  blocks (no bubbles-in-cards), mode selector as an inline segmented control above the
  composer, balance as a persistent slim value in the header (monospace, always
  visible — never a separate "go check your balance" screen).
- **History**: a dense table/list, not a card grid — rows are transactions, and a
  transaction list should look like a ledger, not a gallery.
- **Pricing/topup**: a short, direct panel (current balance, one sandbox top-up action)
  — not a pricing-tier card grid; there's one product, one balance.
- Z-index scale: `dropdown(10) < sticky-header(20) < modal-backdrop(30) < modal(40) <
  toast(50)`.

## Motion

Restrained, physical, functional — confirms state changes rather than decorating them
(emil-design-eng direction from SPEC.md for this product surface, no 3D/playful motion
here — that's reserved for the marketing landing page register).

- Ease-out-quart/expo only. No bounce, no elastic, no spring overshoot.
- Durations: micro state changes (button press, toggle) 120–160ms; content transitions
  (message arrival, balance update) 200–280ms.
- Balance changes and credit charges get a deliberate, brief numeric transition (not a
  hard cut) — this is the primary "trust" motion moment per PRODUCT.md's design
  principles.
- Every animation has a `prefers-reduced-motion: reduce` fallback (instant or
  crossfade) — non-optional per the WCAG AA accessibility baseline.

## Zones (2026-07-20)

The product spans 4 distinct task modalities (text, images, voice, documents) — rather than
one flat palette for all of them, each gets a **restrained hue shift**, not a different
palette. This is a deliberate compromise: the user wanted a stronger per-section identity;
"Restraint reads as confidence" above argues against loud color variety. The resolution is
narrow scope — only `--color-primary`/`--color-accent` shift hue, plus a barely-perceptible
background/surface chroma tint (0.002–0.009, essentially invisible without the two zones
side by side). Typography, layout, spacing, and every component stay identical across zones.

| Zone | Routes | Hue direction |
|---|---|---|
| **Desk** (default) | `/chat`, `/history`, `/pricing`, `/login`, `/register` | unchanged — this IS the root palette |
| **Studio** | `/images`, `/analyze` | warmer, toward orange (primary hue 45 vs. desk's 57) |
| **Voice booth** | `/voice` | cooler, toward blue-violet (accent/primary hue ~275–280, replacing verdigris) |
| **Archive** | `/documents` | lower chroma — quieter, more neutral than desk, not a new hue |

Implemented via `[data-zone="..."]` CSS variable overrides in `globals.css`, applied by
`components/zone.tsx`'s `ZoneScope` (a client component reading the current route) wrapped
around page content only — **never around `<Nav>`**, so the persistent header never shifts
between zones, only the content beneath it does. The five registered zone color tokens
interpolate together over 220ms with the standard strong ease-in-out curve; the transition
names exact properties rather than using `transition: all`, and the existing global
`prefers-reduced-motion` rule reduces it to an effectively instant state change.

## Theme Mode Decision (2026-07-21)

Lumenza remains **dark-only for the current product phase**. This is intentional,
not an omitted `prefers-color-scheme` rule: the near-black instrument surface is a
core part of the brand direction above, and the four zone palettes, semantic status
fills, charts/progress marks, image workspace, and text-on-fill rules have only been
contrast-checked as one dark system.

Do not automatically switch to a light palette from the operating-system preference.
An automatic partial inversion would make the same account look materially different
between devices and would leave zone/status combinations without a verified WCAG AA
contract. When a light theme is introduced, it must ship as a complete second token
set with contrast tests for every zone and semantic state, plus an explicit
`system / dark / light` user control and a pre-hydration preference bootstrap to avoid
theme flash. Until those pieces can land together, one coherent dark theme is the
more trustworthy product choice.

## Components (initial vocabulary)

- **Segmented control** (mode selector: fast / smart / cheap) — not a dropdown, not
  radio pills-as-cards; a single connected control, active segment filled with primary.
- **Status pill** — small, filled with the semantic color (success/danger/accent),
  white text, used for `used_fallback`, provider errors, insufficient-credit states.
- **Ledger row** — history line item: provider/model, mode, status pill, monospace
  credits figure right-aligned, timestamp muted.
- **Composer** — chat input: textarea + segmented mode control + primary send button,
  balance visible inline, never obstructing the input.
