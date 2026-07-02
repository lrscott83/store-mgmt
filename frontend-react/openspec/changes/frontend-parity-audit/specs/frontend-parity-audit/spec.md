# Delta Spec: Frontend Parity Audit (Angular → React)

**Change:** frontend-parity-audit
**Phase:** Spec
**Date:** 2026-07-01
**Mode:** Hybrid (engram + openspec file)

---

Angular (`frontend/`) is source of truth. React (`frontend-react/apps/web-store-pos/`) MUST match it per layer below. Ratified dead-code list (roles placeholder, billing, unused fleet/carrier enums, commented nav, per-page help-dialogs) is OUT OF SCOPE — MUST NOT be ported.

## ADDED Requirements

### Requirement: L1 Models & Enums Parity

React `packages/domain` MUST contain every live Angular model field and enum value.

#### Scenario: Field/enum diff is empty

- GIVEN a generated list of live Angular entity fields and enum members
- WHEN diffed against React domain types
- THEN zero live items are missing (excluding ratified dead list)
- AND error-type/view-model shapes match Angular equivalents

#### Scenario: TodayInventoryStats resolved

- GIVEN `EFeatures.TodayInventoryStats=32` is confirmed live (not behind a commented route) in Angular
- WHEN React enum is diffed
- THEN React includes the equivalent value; otherwise it stays excluded with justification

### Requirement: L2 Services/Data Parity

Every live Angular service method MUST have a React equivalent with matching behavior. Offline-first MUST be respected: `USE_ONLINE_SERVICE=false` routes to local-storage repos, not HTTP.

#### Scenario: Service method coverage

- GIVEN a live Angular service method
- WHEN its React counterpart is invoked with `USE_ONLINE_SERVICE=false`
- THEN it reads/writes local storage, not network, and returns equivalent data shape

#### Scenario: PWA cross-cutting confirmed

- GIVEN connection status, download-manager, and service-worker update flows in Angular
- WHEN exercised in React
- THEN equivalent behavior exists (currency, usage-tracker, shopping-cart included)

### Requirement: L3 Auth/Authorization Parity

Angular guards MUST map 1:1 to React loaders, with identical authorization semantics (`.some()` over roles, `selectedStoreId` check, deny → logout → redirect `/login`).

#### Scenario: Guard-to-loader mapping

- GIVEN an Angular route with `canActivate` guard(s)
- WHEN the equivalent React route is inspected
- THEN a loader enforces the same role/store checks

#### Scenario: Deny path matches

- GIVEN a user lacking required role/store access
- WHEN they hit a protected React route
- THEN they are logged out and redirected to `/login`, matching Angular denial behavior

### Requirement: L4 Views Functional Parity

Per view, React MUST expose the same fields, controls, validations, actions, and empty/error states as Angular.

#### Scenario: Field/control/validation match

- GIVEN an Angular view's form fields, validation rules, and actions
- WHEN the React view is compared
- THEN all fields/controls/validations/actions are present and behave identically

#### Scenario: Empty and error states match

- GIVEN Angular's empty-list and error-response UI
- WHEN triggered in React (no data / API error)
- THEN equivalent empty/error state is shown

### Requirement: L5 Visual/Design Parity

Per view, React MUST visually match Angular's layout/theme via shared Tailwind design tokens and base components (Button, Card, InfoBox) — not a literal SCSS port.

#### Scenario: Shared tokens applied

- GIVEN the extracted Angular design tokens (purple palette, radii, shadows, typography, spacing)
- WHEN a React view is styled
- THEN it uses the shared Tailwind token/base-component set, not ad hoc values

#### Scenario: Visual match on key elements

- GIVEN an Angular view screenshot
- WHEN compared to the React equivalent
- THEN cards, buttons, info-boxes, spacing, and purple theme visually match

### Requirement: L6 i18n Parity

Every live Angular Spanish key in `vocabs/es.ts` MUST exist in React `es.ts` with IDENTICAL Spanish text. Views MUST NOT contain hardcoded strings.

#### Scenario: Key diff is empty

- GIVEN flattened Angular and React `es.ts` key sets
- WHEN diffed
- THEN zero live Angular keys are missing from React and shared text is byte-identical

#### Scenario: No hardcoded Spanish

- GIVEN a React view template
- WHEN grepped for literal Spanish string content
- THEN none is found outside the i18n dictionary

### Requirement: L7 Routes/Navigation Parity

React route paths (including known renames), params, guards, and menu entries MUST match Angular.

#### Scenario: Route table reconciled

- GIVEN the Angular route table (with documented renames)
- WHEN compared to React routes
- THEN paths, params, and guard assignments match, and menu entries correspond 1:1

#### Scenario: Catch-all behavior matches

- GIVEN an unknown path in Angular's catch-all handler
- WHEN the same path is hit in React
- THEN equivalent fallback/redirect behavior occurs

## Per-Module Acceptance (L4+L5+L6 "done = parity")

| Module | Done Criteria |
|---|---|
| Sales | Fields/controls/validations/actions match Angular (L4); shared tokens applied, visual match on cards/buttons/info-boxes (L5); zero missing es.ts keys, no hardcoded strings (L6) |
| Inventory | Same L4/L5/L6 criteria as above, scoped to inventory views |
| Expenses | Same L4/L5/L6 criteria, scoped to expense views |
| Management | Same L4/L5/L6 criteria; ADDITIONALLY: UX-parity decision resolved for list/create/edit — Angular reuses `EditStoreComponent` (list root = edit form) vs React's split list/create/edit routes; decision MUST be documented before slice is marked done |
| Admin | Same L4/L5/L6 criteria, excluding ratified-dead `admin/roles` |
| Sync | Same L4/L5/L6 criteria; PWA cross-cutting (L2) confirmed as prerequisite |
| Reports | Same L4/L5/L6 criteria, scoped to report views |
| Statistics | Same L4/L5/L6 criteria, scoped to statistics views |
| Profile | Same L4/L5/L6 criteria, scoped to profile views |
| Help | Done = ratify single tutorial-page replacement (not mechanical port of 25 per-page dialogs); L6 keys for tutorial page verified |

#### Scenario: Module marked parity-complete

- GIVEN a module's views pass L4, L5, and L6 scenarios above
- WHEN the module slice is reviewed
- THEN it is marked done; Management additionally requires the UX-parity decision documented

## Out of Scope (explicit exclusion)

`admin/roles` placeholder, billing module, `EPermissions`/`ENotificationTemplateType`/`SignatureProvider`/`EMessageStatus` enums, `messages/message.model.ts`, commented-out nav entries, per-page help-dialogs (replaced by single tutorial page), Angular online-mode services beyond products/categories.
