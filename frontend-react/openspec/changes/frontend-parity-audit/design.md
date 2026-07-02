# Design: Frontend Parity Audit — Methodology

## Technical Approach

This is a repeatable AUDIT methodology, not a feature build. Angular (`frontend/`) is the sole source of truth; React (`frontend-react/apps/web-store-pos/`) is measured against it, never assumed correct. Every layer follows: read Angular → read React → record gap in a per-layer matrix → apply fix → verify. Mismatches with no clear Angular answer become OPEN QUESTIONS, not guesses. Offline-first: `USE_ONLINE_SERVICE=false` → offline repos (see `service-factory.ts createService()`), so audit the OFFLINE path first. Texts must end IDENTICAL and in Spanish.

## Architecture Decisions

### Decision: Per-layer diff matrix as the audit unit of record

**Choice**: Each layer produces a matrix `[artifact | angular ref | react ref | status | gap | fix | verified]`, persisted to engram.
**Alternatives**: ad-hoc notes (lossy across sessions); single mega-doc (unmaintainable).
**Rationale**: matrices are diffable, resumable, and map 1:1 to success criteria.

### Decision: L5 — replicate Angular look in NATIVE Tailwind v4 tokens (not port SCSS)

**Choice**: Extract Angular tokens once → Tailwind v4 `@theme` + CSS custom properties in `frontend-react/packages/web-common/styles.css` → build shared base components consumed by every view.
**Alternatives**: port Bootstrap/SCSS (drags Bootstrap runtime, fights Tailwind); per-view ad-hoc classes (drift).
**Rationale**: React already uses Tailwind v4 (`@import "tailwindcss"`, `@theme`/`:root` custom props). CONFIRMED GAP: current React `--color-primary: 34 211 238` (cyan) does NOT match Angular. Tokens live in one file so a single revert restores styling without touching logic.

### Decision: i18n flatten-and-diff, Angular nested → React flat

**Choice**: Flatten Angular nested `vocabs/es.ts` (`MENU.ADMIN.TITLE`) to dotted keys, set-diff against React flat `Record<string,string>` in `app/shared/lib/i18n/es.ts`.
**Rationale**: Structures are 1:1 flattenable (verified both files). Enables exact missing/changed-key lists per module.

## Audit Method Per Layer

| Layer | Read in Angular | Read in React | Record |
|---|---|---|---|
| L1 models/enums | `packages/domain` entities, `EFeatures` | React `packages/domain` | enum/value + error-type/view-model matrix; confirm `TodayInventoryStats=32` is LIVE (route not commented) before porting |
| L2 services | `frontend/src/app/application/*` (offline/online factory) + `_services/*` cross-cutting | `app/**/lib/services/*-offline-service.ts`, `shared/lib/services/service-factory.ts` | method-level gap matrix; offline path first |
| L3 auth | Angular `canActivate` guards | RR loaders/guards, `authorization-service.ts` (EXISTS) | spot-check gate parity |
| L4 views | component .html + .ts (fields, validators, behavior) | route + component .tsx | field/validation/behavior matrix |
| L5 visual | `.scss` + token source files (below) | .tsx classes + `web-common/styles.css` | token map + per-view class application |
| L6 i18n | `vocabs/es.ts` (nested) | `i18n/es.ts` (flat) | missing/changed keys + hardcoded-Spanish list |
| L7 routes | Angular route table | RR route tree + catch-all `shared/routes/$.tsx` | rename + catch-all matrix |

## L5 Design-Token Strategy (where things live)

Angular token SOURCES (read these): `frontend/src/scss/settings/color-variables.scss` (`$purple #6f42c1`, grays, `$blue #1677ff`), `theme-variables.scss` (`--pc-*`: sidebar `#fff`, header shadow `0 1px 0 rgb(240 240 240)`, `$header-height 60px`, `$sidebar-width 260px`, card box-shadow), `bootstrap-variables.scss`, `scss/themes/components/*`. Confirm the actual live primary in the running app (proposal says purple; source `$preset` shows blue `#1677ff`) — RESOLVE before applying.

Extraction target: `frontend-react/packages/web-common/styles.css` — replace the cyan `:root` block and add a Tailwind v4 `@theme` block mapping: colors (primary/purple, surface, muted, semantic), radii, shadows (card, header), typography scale, spacing (header 60px, sidebar 260px).

Shared base components live in NEW dir `frontend-react/apps/web-store-pos/app/shared/components/ui/`: `button.tsx` (Button, FloatingButton), `card.tsx` (Card), `info-box.tsx` (InfoBox). Naming: PascalCase exports, kebab-case files, matching existing `shared/components/*` convention. Every view imports these — no raw ad-hoc styling. Build + review tokens/base components BEFORE per-view application (design-token-first).

## i18n Method

1. Flatten Angular `vocabs/es.ts` recursively → `Set<dottedKey>` (~397).
2. React keys already flat in `app/shared/lib/i18n/es.ts` (~274) → `Set`.
3. Diff: `angular \ react` = missing keys; intersect with differing values = changed keys.
4. Detect hardcoded Spanish: grep React `.tsx` views for literal `[áéíóúñ¿¡]` or Spanish words outside `t(...)`/i18n calls.

Output per module: missing keys + changed keys + hardcoded-string locations.

## Service Parity Method

Confirm factory pattern: React `createService(offline, online)` returns offline when `USE_ONLINE_SERVICE=false`. Enumerate Angular `application/*` services → map each method to React `*-offline-service.ts`; matrix method-level gaps. PWA cross-cutting = DESIGN QUESTIONS (Angular has `_services/connection`, `_services/download-manager`, `_services/update`, `_services/usage-tracker`; React coverage unconfirmed — grep found only scattered refs). Resolve these in the Sync foundation stage before declaring any module at parity. NOTE (resolved, Stage 1 cart batch): `_services/order/shopping-cart.service.ts`'s cart UI/checkout FLOW parity is Stage 1 (Sales) scope, not Sync — only its cross-cutting inventory-availability-on-increase/decrease audit remains a Sync-stage design question (see tasks.md 6.1).

## Per-Module Execution Template (every slice identical)

1. Functional diff (L4): Angular component fields/validators/behavior → React matrix; close gaps.
2. Visual/token application (L5): apply shared base components + tokens to the view; no new ad-hoc styles.
3. i18n diff (L6): flatten-diff module keys; replace hardcoded Spanish with `t()` keys; keys identical Spanish.
4. Verify: matrix all-green, tests pass (Strict TDD), visual spot-check vs Angular.

Module order: Sales → Inventory → Expenses → Management → Admin → Sync → Reports → Statistics → Profile → Help.

## Tracking

Per-module apply-progress in engram: `sdd/frontend-parity-audit/apply-progress` (merge, never overwrite across sessions). Each module records its per-layer matrix status so nothing is lost.

## Open Questions

- [ ] Live primary color: proposal says purple, token source shows blue `#1677ff` — confirm in running Angular app before extracting.
- [ ] `EFeatures.TodayInventoryStats=32` live vs dead (route commented?).
- [ ] PWA cross-cutting (connection, download-manager, SW update, usage-tracker) React coverage — resolve in Sync stage.
- [ ] Management list/edit structural divergence (Angular reuses `EditStoreComponent`; React splits routes) — UX-parity decision in Management slice.
