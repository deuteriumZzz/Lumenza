# Product

## Register

product

## Users

Professional SMM specialists and content creators who need fast, reliable AI-generated
text and images for client work — posts, repurposed copy, content plans, campaign
visuals. They use Lumenza primarily through Telegram day-to-day, but come to this web
app to manage their account: top up credits, review usage history, and run chat/image
generation in a fuller workspace than a Telegram thread allows. They are paying per
request (credit ledger, provider markup) so cost and reliability are visible concerns,
not abstractions — they want to see what a request cost, whether it succeeded, and
what's left in their balance without digging.

## Product Purpose

Lumenza is a Telegram-first AI aggregator narrowed to a specific niche (SMM/content
creation) rather than a general "90+ tools" AI combine. The web app is the account/
control-plane surface: authentication, a multi-provider chat workspace (fast/smart/cheap
routing across OpenAI, Anthropic, Gemini with automatic fallback), usage history, and
billing. Success looks like a user trusting the tool enough to route real client work
through it — which means the product must read as a serious paid instrument with
transparent, correct billing, not a hobby playground.

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
