# Lumenza Completion Master Plan

Status: approved direction, implementation in progress

Branch: `codex/lumenza-completion-audit`

Visual source of truth: `docs/redesign-references/approved/*.png` at `1586×992`

Product source of truth: `/PRODUCT.md` and `/DESIGN.md`

## 1. Objective

Complete Lumenza as one coherent AI command workspace that matches the six approved
screenshots in geometry, density, hierarchy and interaction language while preserving
real product behavior. The legacy frontend is not a visual source of truth. It remains
useful only where it contains working contracts, data flows or the approved Chat and
Agents motion foundation.

The completion scope includes:

- all visible frontend routes and controls;
- one continuous sidebar/workspace shell;
- the Chat to Agents continuity transition;
- official provider identities;
- original state-aware Lumenza companions;
- functional, accessibility, responsive, motion and performance verification;
- backend Phase E, OAuth Hub;
- backend Phase F, Builder and Hosting.

Every completed phase is committed and pushed independently to
`codex/lumenza-completion-audit`.

## 2. Confirmed baseline

- [x] Stable restored product interface with real Chat, Agents and Studio behavior.
- [x] Shared Lumenza Core retained for Chat and Agents.
- [x] 346 frontend tests previously passed with 94.04% statement and 85.43% branch
  coverage before this audit cycle.
- [x] Async race in the Image edit-mode test fixed and reverified 3/3.
- [x] ESLint, TypeScript and production build pass.
- [x] High severity `nanoid` advisory fixed at `3.3.18`.
- [x] Canonical `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and live config.
- [x] Separate branch created and the first two phases pushed.

Known dependency gate: npm still reports two moderate PostCSS advisories through the
current Next.js package range. `npm audit fix --force` would perform an unreviewed Next
framework upgrade and is not acceptable inside the baseline commit. Resolve this in a
dedicated, fully tested Next upgrade phase.

## 3. Independent audit snapshot

### 3.1 Visual comparison at 1586×992

| Screen | Current result | Reference gap | Priority |
|---|---|---|---|
| Chat | Closest current match. Unified shell, core, composer, capability rail and cards are present. | Provider control lacks official mark; surface is still affected by legacy decorative grid/glow rules; exact anchors and typography need automated overlay measurement. | P1 |
| Agents | Real agent form and catalog behavior remain available. | Central network is cropped to the right and only part of the node system is visible; title and hero density are heavier than reference; lower composer/category content is clipped at the reference viewport. | P1 |
| Studio | Global and contextual rails exist; modes and real creation workspaces are connected. | Gallery uses blurred placeholder orbs instead of reference-grade visual assets; bottom prompt dock is not visible as a complete signature surface at the reference viewport; some Preview controls still behave as selectable production controls. | P1 |
| Account | Identity, plan, companion selection and agent context are functional. | Pets are flat static glyphs, not the detailed 2.5D state-aware companions in the reference; the primary companion card consumes space without expressive state; content hierarchy extends below the intended first viewport. | P1 |
| Knowledge | Import, semantic search, OCR, sources and workspaces are real. | The import surface dominates the initial viewport, pushing the sources table and inspector below the reference composition; inspector behavior is not yet origin-aware. | P1 |
| All Tools | Search, filters, featured tool, cards and details exist and visually approach the reference. | Inspector is permanently open and cannot close with Escape; favorites are local-only; category rail and lower grid need exact overflow/viewport tuning. | P2 |

### 3.2 Functional findings

P0: no static execution blocker was found.

P1 findings:

1. Apps and Community appear as top-level sidebar destinations but route to Studio
   query states and cannot own an active global-navigation state.
2. Studio cards labelled `Soon` or `Preview` remain selectable in code paths that call
   `onSelect`.
3. Studio settings appear production-ready but generation requests do not send those
   values to the backend.
4. `/voice` and `/videos` redirect to the default Studio Image mode and lose the user's
   original intent.

P2 findings:

1. Studio contains an unreachable `view=tools` catalog path.
2. Tool favorites disappear after navigation or reload.
3. `/chat/[threadId]` accepts non-numeric IDs as `NaN` instead of returning a route-level
   invalid state.
4. All Tools inspector has no close or Escape interaction.

P3 findings:

1. Login, registration, legal pages and redirect intent lack direct page tests.
2. Narrow-screen verification is mostly string-based; no real browser viewport suite
   validates the sidebar/composer width calculations.
3. The test harness slows materially under concurrent full-suite runs; CI needs stable
   worker limits and deterministic timeouts rather than larger global timeouts.

## 4. Acceptance contract

No UI phase is complete until all applicable requirements pass:

- screenshot comparison for the matching approved route at `1586×992`;
- major anchors within 2px, internal spacing within 4px, radius within 2px and type size
  within 1px after font stabilization;
- 320, 375, 768, 1024, 1280 and 1586px viewport checks;
- no browser console error, hydration warning or uncontrolled failed request;
- every visible control performs an action, provides an honest Preview/disabled reason,
  or is removed;
- complete hover, focus, active, loading, success, empty, disabled and error states;
- keyboard completion, Escape and focus return for transient panels;
- WCAG 2.2 AA and no color-only state;
- reduced-motion mode preserves meaning while removing spatial/ambient movement;
- routine UI motion below 300ms; longer motion only for rare signature scenes;
- frontend and backend coverage at least 80%; the current frontend coverage must not
  materially regress;
- production build, dependency audit and security review before commit.

## 5. Frontend implementation phases

### Phase 0: stable baseline

Status: complete and pushed.

Commit: `fix: restore stable workspace interface and core motion`

Deliverables:

- restored real behavior instead of static replacement pages;
- shared Lumenza Core in Chat and Agents;
- extracted Studio workspaces;
- stable storage test shim and Image async test.

### Phase 1: canonical product and design system

Status: complete and pushed.

Commit: `docs: establish Lumenza product and design canon`

Deliverables:

- root canonical product/design documentation;
- exact reference list and semantic tokens;
- component and motion vocabulary;
- impeccable machine-readable sidecar and live config.

### Phase 2: deterministic audit harness

Commit: `test: add functional and visual audit harness`

Deliverables:

- deterministic test user and fixtures;
- Playwright configuration and authenticated setup;
- route/control inventory;
- six screenshot captures at the reference viewport;
- baseline, diff and overlay artifacts;
- browser console, failed request and hydration collection;
- controlled clock, font readiness and disabled ambient loops for visual capture;
- sequential/stable Vitest CI worker configuration.

Tests first:

- login and shell smoke;
- route matrix;
- visible controls have valid destinations or explicit disabled semantics;
- screenshot command fails when a required route is absent.

### Phase 3: design foundation and unified shell

Commit: `refactor: unify workspace shell and design foundations`

Deliverables:

- CSS tokens aligned to DESIGN;
- decomposition of the 2700-line global stylesheet into owned layers;
- 248px desktop sidebar, continuous workspace and account anchor;
- identical nav hover grammar for every destination;
- route and active-state registry including real Apps and Community identities;
- explicit mobile drawer and responsive inspector behavior;
- removal of decorative grids, indiscriminate gradients/glass, excessive shadows,
  pill-everything and legacy left-border patterns that conflict with references.

### Phase 4: Chat and Agents command deck

Commit: `feat: rebuild chat and agents command deck`

Deliverables:

- pixel-aligned Chat and Agents compositions;
- fully visible Agents node network;
- one shared Lumenza Core with state machine;
- Chat to Agents `shared element transition + morph + continuity transition`;
- direction-aware reverse transition;
- uninterrupted composer identity where appropriate;
- real model, task, preset, knowledge, streaming and agent-run behavior preserved.

Motion contract:

- hover response begins within 80ms;
- routine controls 120-180ms;
- route content 200-290ms;
- signature Core morph 420-600ms only because it is rare and explanatory;
- no `transition: all`, `ease-in`, `scale(0)` or layout-property animation;
- pointer hover motion gated to fine pointers;
- reduced motion uses an immediate shared-position crossfade.

### Phase 5: provider identity registry

Commit: `feat: add official model provider identities`

Deliverables:

- normalized `ProviderIdentity` registry;
- official locally stored SVG marks for supported providers;
- display name, aspect ratio, monochrome/color policy and safe unknown fallback;
- attribution and redistribution notes;
- consistent 20-24px usage in picker, selected control and response metadata;
- no fabricated or generated company marks and no unsafe SVG injection.

### Phase 6: Studio

Commit: `feat: rebuild studio workspace`

Deliverables:

- reference-aligned contextual rail, gallery, modal and bottom prompt dock;
- real media assets rather than blurred placeholder cards;
- Image, Video, Audio, Edit, Upscale and Reference modes with truthful availability;
- settings sent through frontend API and backend request contracts;
- unavailable providers represented as disabled Preview paths;
- `/images`, `/videos`, `/voice`, `/documents`, `/analyze` and `/code` preserve intent.

### Phase 7: companion art and state system

Commit: `feat: add state-aware Lumenza companions`

Deliverables:

- original Lumenza fox, cat, robot, dragon, rabbit and blob;
- a coherent 2.5D cinematic world inspired by the product role, not copied from Codex;
- imagegen concept sheet and turnaround before production assets;
- states: `idle`, `listening`, `thinking`, `typing`, `success`, `error`;
- declarative state machine connected to Chat stream, Agent runs, Studio generation,
  OAuth and Builder jobs;
- offscreen/background pause and visibility-aware playback;
- reduced-motion static poses;
- initial selected-pet payload target at or below 300KB and full selected animation pack
  at or below 1MB; zero layout shift.

Implementation sequence:

1. Generate all six concepts from the Account reference and DESIGN palette.
2. Approve one technical-spike character.
3. Test CSS sprite/Lottie/Rive/canvas options against quality, size and state control.
4. Ship the smallest runtime that meets the visual bar.
5. Produce remaining characters using the approved pipeline.

### Phase 8: Account

Commit: `feat: rebuild account and companion controls`

Deliverables:

- reference-aligned account rail and first viewport;
- rich companion picker and live preview;
- show/hide, rename, select, upload and remove flows;
- identity, plan and Agent Context hierarchy;
- upload type/size validation and safe rendering;
- dialog focus management and recovery messages.

### Phase 9: Knowledge

Commit: `feat: rebuild knowledge workspace`

Deliverables:

- reference-aligned import surface, sources table and right inspector in one viewport;
- recent sources and collections;
- semantic search, text import and image OCR preserved;
- selected-source deep state and closable inspector;
- honest integration previews that become OAuth capabilities in Phase E.

### Phase 10: All Tools

Commit: `feat: rebuild all tools catalog`

Deliverables:

- search, category rail, featured tool, responsive grid and inspector;
- close and Escape behavior with focus return;
- persistent account-backed favorites or removal of the durable favorite affordance;
- valid category deep links and destinations;
- exact overflow handling at the reference viewport.

### Phase 11: secondary routes and real controls

Commit: `refactor: align secondary workspaces with the command deck`

Deliverables:

- Automations, History, Usage, Pricing, Login, Register and legal routes aligned to the
  same shell and token system;
- valid thread ID handling;
- direct page and redirect tests;
- Apps and Community become real routes or are intentionally reclassified in PRODUCT;
- every Preview, favorite, settings, filter and overflow control is truthful.

### Phase 12: impeccable completion pass

Commit: `fix: complete interface audit and design polish`

The passes are applied deliberately, not as contradictory global filters:

| Pass | Target |
|---|---|
| `craft` | real flows and complete component states |
| `critique` | independent route-by-route comparison |
| `layout` | geometry and responsive structure |
| `typeset` | hierarchy, wrapping and numeric precision |
| `colorize` | token consistency and contrast |
| `animate` | purposeful continuity and feedback |
| `bolder` | Core, Agents network, companion, creation previews only |
| `quieter` | shell, forms, tables and repeated navigation |
| `distill` | duplicate chrome, cards, tokens and decorative noise |
| `clarify` | labels, recovery, availability and cost copy |
| `adapt` | tablet and mobile transformations |
| `harden` | long content, offline, empty, error, expiry and rate limits |
| `optimize` | bundles, images, animation pause and Core Web Vitals |
| `delight` | state-aware companion and completion feedback |
| `overdrive` | one controlled signature experiment for Core/companion only |
| `polish` | final 1-4px and motion-timing discrepancies |
| `audit` | final independent functional/a11y/performance report |
| `live` | human comparison of disputed Core, provider and companion variants |

ANTI-SLOP is a continuous release filter. Animation Vocabulary names each effect;
Emil Design Engineering defines timing and physical behavior; Review Animations must
approve the final motion diff.

## 6. Backend Phase E: OAuth Hub

### E1. encrypted integration foundation

Commit: `feat(integrations): add encrypted connection foundation`

Create `backend/integrations/` with connection, OAuth flow and audit event models;
provider registry; service layer; throttling; tasks and tests.

Security invariants:

- access and refresh tokens never reach frontend, admin, logs or exceptions;
- versioned authenticated encryption through a dedicated keyring, not Django
  `SECRET_KEY`;
- production startup fails when OAuth is enabled without encryption keys;
- minimum scopes and incremental consent;
- owner-filtered querysets and negative cross-tenant tests.

### E2. state, PKCE and callback flow

Commit: `feat(integrations): implement state and PKCE oauth flow`

- 256-bit state, stored only as a hash;
- PKCE S256 verifier encrypted at rest;
- 10-minute expiry and one-time consumption;
- fixed redirect URI and allowlisted return path;
- POST authorize endpoint with CSRF;
- callback never returns tokens.

### E3-E7. provider adapters

One commit and push per provider:

1. GitHub
2. Slack
3. Google
4. Atlassian
5. Salesforce

Each provider receives mocked contract tests and a separate live smoke gate when the
user supplies credentials. Provider URLs are code-owned allowlists to prevent SSRF.

### E8. refresh, revoke and audit workers

Commit: `feat(integrations): add refresh revoke and audit workers`

- lazy and scheduled refresh;
- short refresh lease plus token-version compare-and-swap;
- immediate disable on disconnect;
- bounded revoke retries and ciphertext cleanup;
- redacted structured audit trail.

### E9. confirmed integration actions

Commit: `feat(automations): add confirmed integration actions`

External mutations use `preview -> explicit confirmation -> execute -> audit` with an
immutable payload hash and a fresh ownership/scope/status check immediately before
execution.

### E10. Apps workspace

Commit: `feat(frontend): add integrations management`

Ship a real `/apps` route with connect, reconnect, verify, expiry, error and revoke
states. E2E uses a local fake OAuth provider; real providers receive manual smoke gates.

## 7. Backend Phase F: Builder and Hosting

Phase F ships static sites, SPAs and browser games first. Arbitrary dynamic backend
code is a separate security-gated runtime. The existing privileged Piston service must
not be reused as a hosting runtime.

### F1. project and immutable revision domain

Commit: `feat(builder): add project and immutable revision domain`

Create `BuilderProject`, immutable `ProjectRevision` and idempotent `BuildJob` with
owner boundaries, quotas, normalized manifest and content hashes.

### F2. private artifact storage

Commit: `feat(builder): add private object storage adapter`

- S3-compatible private storage;
- content-addressed immutable objects;
- signed preview access;
- checksum, owner isolation, retention and cleanup retry tests;
- MinIO driver for local integration tests.

### F3. generation and manifest validation

Commit: `feat(builder): add generated project manifest pipeline`

Reject path traversal, symlinks, zip bombs, excessive files, executable payloads,
secret material and invalid MIME/extensions before extraction or build.

### F4. isolated static build pipeline

Commit: `feat(builder): add isolated static build executor`

- separate queue and worker;
- no Docker socket;
- non-root, read-only root filesystem and tmpfs workspace;
- network off by default;
- CPU, memory, PID, time and output limits;
- curated templates and pinned dependencies only in the first release;
- sanitized bounded logs and billing refund on failure.

### F5. deployment and atomic releases

Commit: `feat(hosting): add deployment and atomic release lifecycle`

Create deployments, immutable releases and atomic pointer switches. Rollback creates a
new pointer transition. Delete removes routing first and performs artifact cleanup with
a verifiable tombstone.

### F6. static hosting gateway

Commit: `feat(hosting): add wildcard static gateway`

- separate registrable hosting domain, never the authenticated application origin;
- wildcard DNS/TLS;
- strict Host pattern and signed route map;
- immutable assets and CDN cache invalidation;
- sandboxed preview iframe without `allow-same-origin`.

### F7. Builder frontend

Commit: `feat(frontend): add builder editor preview and deploy flow`

Create project, generate, inspect revision, build, preview, deploy, rollback, suspend
and delete flows with visible job state, logs, cost and recovery.

### F8. metering, budgets and lifecycle

Commit: `feat(hosting): add metering budgets and idempotent billing`

- build holds and reconcile/refund;
- daily storage/request/egress/runtime windows;
- unique billing idempotency keys;
- monthly hard budget;
- automatic suspension before negative balance;
- no runtime charges while suspended or deleted.

### F9. dynamic runtime, separately gated

Commit sequence:

- `feat(runtime): add isolated dynamic application runtime`
- `feat(runtime): add scoped datastore and secret bindings`

Minimum bar: rootless build, signed images, gVisor/Kata/Firecracker-class isolation,
per-deployment identities, read-only filesystems, deny-by-default egress, no access to
platform DB/Redis/Celery, scoped secret broker, quotas, scale-to-zero and automatic
rollback. No production release without adversarial escape, SSRF and cost-DoS tests.

## 8. External dependencies and honest blockers

Code, fake-provider OAuth tests and local MinIO/static-gateway integration can be
completed without external credentials. The following live gates require user or
infrastructure input:

1. Public HTTPS application URL and redirect URLs.
2. GitHub, Slack, Google, Atlassian and Salesforce OAuth app registrations.
3. Client IDs/secrets supplied through environment or a secret manager.
4. Dedicated OAuth encryption keyring and rotation policy.
5. Trademark/redistribution review for official provider marks.
6. Production S3/R2 provider, region, CDN/edge provider and container registry.
7. Separate hosting domain with wildcard DNS/TLS.
8. KMS/secret manager, infrastructure budget and recurring billing policy.
9. Static-only launch decision versus a later dynamic runtime.
10. Abuse, takedown, retention and public-content terms.

Real provider smoke tests and production hosting go-live cannot be truthfully marked
complete until these are supplied. Their absence does not block local implementation,
security tests or a static hosting technical release candidate.

## 9. Final release gate

Commit: `chore: complete Lumenza release verification`

- all frontend and backend suites pass at 80% or higher coverage;
- all six visual comparisons meet the acceptance contract;
- complete browser E2E for login, Chat stream, Chat to Agents, Agent run, Studio create,
  pet selection, Knowledge import/search, Tools, OAuth connect/revoke and Builder
  publish/rollback;
- security reviews contain no Critical or High findings;
- migrations, owner isolation, throttling, CSRF, token redaction and billing idempotency
  pass;
- no broken control, dead route, console error or hydration warning;
- WCAG 2.2 AA, reduced motion and responsive matrix pass;
- LCP below 2.5s, INP below 200ms and CLS below 0.1 on the agreed test profile;
- `critique`, `audit`, `polish` and `review-animations` provide explicit approval.
