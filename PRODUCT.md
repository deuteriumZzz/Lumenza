# Product

## Register

product

## Product Definition

Lumenza is a unified AI command workspace for people who want to complete real work
without moving between disconnected model dashboards. Chat, Agents, Knowledge, Studio,
Automations, Tools, Apps, Community and Account are different operating modes inside
one continuous product shell. Web and Telegram are clients of the same identity,
balance, files, agents, integrations and history.

The six approved reference screens in `docs/redesign-references/approved/` are the
visual source of truth. Existing implementation details are not visual precedent when
they conflict with those references.

## Users and Jobs

- Independent creators and specialists who need research, writing, analysis, media and
  document work in one place.
- Small teams that need reusable knowledge, agents, connected services and transparent
  execution history.
- Advanced users who choose providers and models directly, while still expecting a
  prepared outcome-first path for common jobs.
- People working across web and Telegram who expect the same account, entitlements and
  context everywhere.

Users should be able to state a goal, understand which system will execute it, see its
cost and progress, inspect or reuse the result, and recover from failure without
leaving the current workspace.

## Product Purpose

Lumenza combines nine coherent capabilities:

1. **Chat** — direct conversation with transparent provider and model selection.
2. **Agents** — curated, versioned workflows that request only essential inputs.
3. **Knowledge** — reusable personal and team context attached to work.
4. **Studio** — image, voice, video, analysis and document creation in one visual mode.
5. **Automations** — scheduled and event-driven work with visible run state.
6. **Tools** — a searchable catalog of focused capabilities with integrated details.
7. **Apps** — secure OAuth connections to external services.
8. **Community** — discoverable, reusable workflows and agents.
9. **Account** — identity, billing, preferences and a state-aware Lumenza companion.

The product starts from the user's intended outcome. Provider choice, cost, routing,
fallback and execution detail remain available without becoming the first obstacle.
Standard access must complete useful work; paid access expands quality, limits,
priority and provider choice rather than unlocking basic product structure.

## Brand Personality

Luminous, precise, composed and capable. Lumenza should feel like a premium command
deck built for sustained work: dark but readable, technically advanced but not
intimidating, expressive at signature moments and quiet everywhere else. It is not a
toy, a reskinned model picker or a collection of unrelated microsites.

## Anti-references

- A generic ChatGPT clone with a narrow bubble column and model selector as the whole
  product.
- Purple-gradient AI branding, indiscriminate glassmorphism, glowing borders and
  decorative particle noise.
- A generic SaaS dashboard made from interchangeable rounded KPI cards.
- Crypto-terminal density, neon overload or permanent sci-fi spectacle.
- Childish gamification. The companion communicates state and continuity; it does not
  turn professional work into a reward loop.
- Route-by-route reinvention. Navigation, surfaces, spacing and motion must remain one
  system across every screen.

## Design Principles

- **References over legacy.** The six approved screenshots define hierarchy, density,
  shell geometry and visual character. Legacy UI is retained only where it supports
  real functionality or the approved Chat/Agents motion language.
- **One shell, many modes.** The sidebar, workspace frame, account access, spacing and
  transition grammar remain continuous while content changes.
- **Outcome first, control nearby.** Prepared agents and tools accelerate common jobs;
  provider, model and advanced settings remain understandable and one action away.
- **Cost and state are never hidden.** Credit holds, final charge, provider fallback,
  progress and errors appear at the point of action.
- **Motion explains continuity.** Lumenza Core morphs between Chat and Agents; panels
  preserve spatial origin; loading, thinking, speaking and completion states have
  distinct motion. Motion never delays input.
- **The companion is a system messenger.** The selected pet reflects idle, listening,
  thinking, typing, success and error states in Account and optional workspace display.
- **Provider identity is authentic.** Model pickers use recognizable official provider
  marks in a controlled icon system, never fabricated lookalikes.
- **Real controls only.** Every visible button has a working action, designed disabled
  state, or is removed. No demo-only chrome in production routes.
- **Secure expansion.** OAuth tokens are encrypted, scoped, refreshable and revocable.
  Builder execution is isolated, observable and separated from public hosting.
- **Restraint earns emphasis.** Gold marks primary intent, cyan marks intelligence and
  information, semantic colors mark state. Signature spectacle is reserved for the
  core, companion and creation previews.

## Accessibility and Inclusion

WCAG 2.2 AA is the baseline: keyboard-complete interaction, visible focus, body-text
contrast of at least 4.5:1, large-text contrast of at least 3:1, 44px touch targets
where practical, meaningful labels, announced async state and no color-only meaning.
Every animation has a `prefers-reduced-motion` equivalent that preserves state and
orientation. Responsive layouts must remain usable from 320px through wide desktop
without hiding required actions.
