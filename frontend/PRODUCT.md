# Product

## Register

product

## Users

People who want strong AI without learning prompt engineering or opening several
services. Some arrive for a direct conversation with a specific model; others want a
ready-made outcome such as a content day for Threads, financial analysis, research, an
image, or document processing. Power users still need transparent model choice, cost,
history, and reusable knowledge. Web and Telegram Mini App are two clients of the same
account, catalog, agents, files, and credit balance.

## Product Purpose

Lumenza is one AI workspace with four coherent modes:

1. **Chat** — direct access to compatible models with optional explicit model choice.
2. **Agents** — curated one-click solutions that ask only for essential inputs and run
   a versioned workflow with the right instructions, models, tools, and output format.
3. **Knowledge** — reusable company or personal context attached to chats and agents.
4. **Studio** — images, voice, documents, and media analysis.

The home experience starts from the user's goal, not from a wall of model names. A
goal card may open a prepared agent, while the model picker remains available inside
Chat for users who want direct control. Web and Mini App use the same backend contracts;
neither is a reduced copy of the other.

The base plan exposes every product capability immediately. There is no usage-based
leveling or unlock progression. Monetization is attached to premium models, credits,
limits, and priority routing. Standard models remain useful enough to complete real
tasks; Pro expands quality and choice rather than making the base product a demo.

## Brand Personality

Premium, confident, agency-grade. This is a professional's tool, priced and billed like
one — not a free experiment. Interactions should feel deliberate and controlled: precise
feedback on cost and state, no cutesy filler, no uncertainty about what a click will do
or cost. Confidence over cleverness.

## Anti-references

- Generic ChatGPT/AI-playground clone — the default "chat bubble in a centered column"
  look undercuts the premium positioning and risks reading as a bare API wrapper
  reselling someone else's model (a real usage-policy concern noted in SPEC.md), not a
  product with its own point of view.
- Typical SaaS dashboard cliché — card grids on a cream/off-white background, KPI tiles,
  gradient-accented hero metrics. Overused to the point of being invisible.
- Corporate enterprise software — heavy chrome, dense toolbars, bureaucratic density.
  This is a lean, fast tool for one person doing client work, not an org-wide platform.

## Design Principles

- **Cost and state are never hidden.** Every credit-consuming action shows its price and
  the resulting balance inline, at the moment of the action — never a "check your
  account later" pattern. This is the product's core trust mechanic given SPEC.md's
  hold/reconcile billing model.
- **Restraint reads as confidence.** A premium/agency-grade feel comes from precision
  (type, spacing, one considered accent) rather than density or decoration. Quieter is
  more premium than louder here.
- **The tool disappears during work.** Chat is the primary task; mode selection, balance,
  and history support it but must not compete with the actual conversation for attention.
- **Outcome first, model choice second.** Ready-made agents reduce configuration for
  common goals; direct model access remains one click away for users who want it.
- **One entitlement contract everywhere.** Web, Telegram Mini App, bot, and API show the
  same standard/premium access. No client invents its own locks.
- **Agent quality is a product asset.** Agent instructions and workflows are versioned,
  evaluated, observable, and rollbackable. They are not loose prompts embedded in UI.
- **Motion is functional, not decorative.** Micro-interactions confirm state changes
  (message sent, credits charged, fallback triggered) — restrained and physical, never
  playful bounce or elastic easing, per SPEC.md's emil-design-eng direction for this
  surface.
- **Every provider/billing edge case has a designed state.** Insufficient credits,
  provider fallback-in-progress, provider failure, empty history — these are real,
  frequent states given the hold/reconcile + multi-provider-fallback architecture, not
  rare edge cases to patch in later.

## Accessibility & Inclusion

Standard WCAG AA baseline: body text ≥4.5:1 contrast, large text ≥3:1, full keyboard
navigation, visible focus states, and a `prefers-reduced-motion` alternative for every
animation (relevant given the emil-design-eng micro-animation direction). No additional
requirements specified beyond AA.
