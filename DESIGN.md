---
name: Lumenza Luminous Command Deck
version: 1.0.0
source_of_truth:
  - docs/redesign-references/approved/chat.png
  - docs/redesign-references/approved/agents.png
  - docs/redesign-references/approved/studio.png
  - docs/redesign-references/approved/account.png
  - docs/redesign-references/approved/knowledge.png
  - docs/redesign-references/approved/all-tools.png
theme: dark
font_ui: Geist Sans
font_data: Geist Mono
radius:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 18px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
---

# Design

## Overview

The north star is a **Luminous Command Deck**: a continuous obsidian workspace where
gold signals intent and cyan reveals intelligence. It combines the calm precision of a
professional instrument with a small number of unmistakably Lumenza moments. The six
approved screenshots are the primary visual contract; implementation is compared to
them at matching 1586×992 viewports before responsive adaptation.

The desktop shell has one 262px sidebar, measured from the approved 1586px references,
and one uninterrupted workspace. Navigation is
not split into unrelated visual sections. Account remains anchored at the bottom.
Contextual subrails and inspectors may appear inside the workspace, but must read as
layers of the same shell. Main gutters scale from 28px to 52px. Content uses an
intentional mix of dense operational lists and larger creation surfaces, never a
uniform dashboard-card grid.

Motion preserves continuity. Hover feedback begins within 80ms; micro interactions run
120–180ms; panels and route content run 220–320ms; signature Chat↔Agents core morphs
may run 420–600ms. Use restrained ease-out curves with no gratuitous bounce. Lumenza
Core, the companion and creation previews may use deeper layered motion, while routine
controls stay quiet. Reduced-motion mode replaces spatial travel and morphing with
short opacity changes and immediate state updates.

## Colors

The palette is dark-only for this phase and consistent across every route. Studio may
increase image color through content, not by replacing the application palette.

| Token | Value | Use |
|---|---:|---|
| `bg.root` | `#080D11` | outer canvas |
| `bg.sidebar` | `#0B1116` | persistent navigation |
| `surface.1` | `#10171C` | primary workspace surfaces |
| `surface.2` | `#151E24` | raised controls and panels |
| `surface.3` | `#1B252C` | active/hover surfaces |
| `border.subtle` | `#243039` | structural separation |
| `border.strong` | `#394751` | focus-adjacent and selected edges |
| `text.primary` | `#F4F6F7` | primary copy |
| `text.secondary` | `#AAB4BA` | supporting copy |
| `text.muted` | `#74818A` | metadata |
| `signal.gold` | `#EAB552` | primary action and active intent |
| `signal.gold.hover` | `#F5C46C` | hover state |
| `lumen.cyan` | `#58D5E3` | intelligence, links and information |
| `success` | `#49CC8B` | completed state |
| `warning` | `#E9A94F` | caution and credit holds |
| `danger` | `#EE6666` | destructive and failed state |

Gold and cyan never become page-wide fills. Filled gold controls use `#11161A` text;
filled cyan controls use the same dark text after contrast verification. White text is
used on darker semantic fills. Focus uses a two-layer ring: 2px root-color separation
plus 2px cyan. Provider brand colors are confined to their official icon marks and do
not recolor surrounding controls.

## Typography

Geist Sans is the sole UI family. Geist Mono is reserved for balances, token counts,
latency, IDs, timestamps and code. The hierarchy is made through size, weight and
spacing rather than multiple display fonts.

| Role | Size / line height | Weight |
|---|---|---:|
| Workspace title | 32/38px | 600 |
| Section title | 20/26px | 600 |
| Card/row title | 15/21px | 600 |
| Body | 14/21px | 400 |
| Control | 13/18px | 550 |
| Metadata | 12/17px | 450 |
| Micro label | 11/15px | 600, tracked |

Page titles use balanced wrapping; explanatory text uses pretty wrapping and a 68ch
maximum. Interface labels use sentence case. All numeric cost and telemetry values use
tabular figures. Avoid extra-bold headings, tiny low-contrast metadata and uppercase
paragraphs.

## Elevation

Depth comes from nested surface values and restrained borders, not large blurred
shadows. The sidebar and base workspace are flat siblings. Raised controls use
`surface.2`; menus, inspectors and modals use `surface.2` plus a subtle 1px border and
one compact shadow. Glass blur is limited to transient overlays where content visibly
moves underneath.

- Level 0: root and sidebar; no shadow.
- Level 1: cards, composers and list containers; subtle border, no shadow.
- Level 2: sticky docks and inspectors; strong top/side edge, `0 8px 24px #00000038`.
- Level 3: menus and dialogs; `0 18px 48px #00000066`, scrim `#020507B8`.
- Focus and selection are different: focus is cyan ring; selection is a surface change
  plus gold icon/text detail.

Radii follow object scale: 6px for small controls, 10px for buttons and fields, 14px
for cards and panels, 18px only for the main composer or large media surface. Do not
turn every object into a pill. Dividers are used only where grouping is otherwise
ambiguous.

## Components

- **Unified sidebar** — 262px desktop rail; Chat, Agents, Studio and remaining product
  destinations share one list grammar. Each item has icon, label and a single animated
  hover surface. Active state uses gold detail and `surface.3`, never a detached tab.
- **Lumenza Core** — central animated identity used in Chat and Agents. It has idle,
  listening, routing, thinking, typing, success and error states. Chat↔Agents performs
  a shared-geometry morph so the mark appears continuous across the route change.
- **Composer** — a wide task surface with textarea, attachments, provider/model identity,
  mode and send action. Controls remain reachable without obscuring input or balance.
- **Provider picker** — official company marks in consistent 20–24px icon containers,
  provider name, model name, capability/cost metadata and selected state. Logos are
  sourced from official brand assets and preserve their required proportions.
- **Context subrail** — optional secondary rail for Studio or Account. It starts inside
  the workspace frame and never duplicates global navigation.
- **Inspector** — right-side detail panel for Knowledge and Tools. It animates from the
  selected row/card origin, preserves list context and closes with Escape.
- **Operational row** — dense, keyboard-selectable row for history, knowledge, runs and
  integrations; state, owner/time and cost remain aligned and scannable.
- **Creation card** — media or agent preview with meaningful visual content, compact
  metadata and contextual actions revealed without layout shift.
- **Companion** — a generated 2D/3D hybrid character rendered as a transparent layered
  asset or real-time canvas. Presets share a consistent Lumenza world and support idle,
  listening, thinking, typing, celebrating and error animations. It is optional in the
  workspace and fully visible in Account.
- **Panel and dialog** — clear title, purpose, primary action and dismissal. Enter/exit
  motions share an origin, preserve focus and return focus on close.
- **Status feedback** — inline first, toast second. Loading uses progress or skeletons
  that match final geometry; errors explain recovery; disabled controls explain why.

## Do’s and Don’ts

**Do** match screenshot geometry at the reference viewport before interpreting it.
**Do** keep every route inside the same sidebar and workspace frame. **Do** reserve gold
for intent and cyan for intelligence. **Do** let data, provider identity and generated
media supply controlled visual richness. **Do** give every control hover, focus, active,
loading, success, disabled and error states. **Do** test keyboard, reduced motion,
mobile reflow and long Russian/English content. **Do** use the companion and Lumenza
Core as state-bearing signatures.

**Don’t** copy obsolete frontend styling when it conflicts with a reference. **Don’t**
fill pages with generic bento cards, gradient text, glowing outlines, decorative grids,
excessive blur or random particles. **Don’t** use spring bounce for routine UI. **Don’t**
make all buttons pills or pair every border with a large shadow. **Don’t** fabricate
provider logos. **Don’t** create controls that only look interactive. **Don’t** hide
critical actions on narrow screens or communicate state using color alone.
