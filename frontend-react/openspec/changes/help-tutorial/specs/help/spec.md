# Help Specification

**Change:** help-tutorial
**Phase:** Spec
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

New static in-app help/tutorial page accessible to any authenticated user. Renders a native
accordion of 4 hardcoded Spanish steps with 6 screenshots. Surfaced via a new Help sidebar
menu group with no feature gating.

---

## Requirements

### Requirement: Help Tutorial Route Registration (HELP-ROUTE)

The system MUST register the route `help/tutorial` in `app/routes.ts` under the existing
`app-layout` route block, pointing to the tutorial page component.

The route module MUST export a named `loader` (inherited from `app-layout`'s `authLoader`) AND
a default export for the page component.

No `featureLoader` or `superAdminLoader` MUST be applied to this route.

#### Scenario: S-HELP-ROUTE-1 — Route resolves for authenticated user

- GIVEN `app/routes.ts` is loaded
- WHEN the router resolves path `help/tutorial`
- THEN it mounts the tutorial page component under the `app-layout` parent

#### Scenario: S-HELP-ROUTE-2 — No feature loader on route

- GIVEN the route definition for `help/tutorial`
- THEN no `featureLoader` or `superAdminLoader` is referenced — only the parent `authLoader` applies

---

### Requirement: Help Tutorial Access Control (HELP-ACCESS)

The `help/tutorial` route MUST be accessible to any authenticated user regardless of role or
feature flags. Auth is inherited from the parent `app-layout` `authLoader`.

Unauthenticated users MUST be redirected to `/login` by the inherited `authLoader`.
No feature gate (`featureLoader`) MUST exist on this route.

#### Scenario: S-HELP-ACCESS-1 — Authenticated user reaches page

- GIVEN any authenticated user (OwnerAdmin, Reseller, or SuperAdmin)
- WHEN they navigate to `help/tutorial`
- THEN the tutorial page renders without redirect

#### Scenario: S-HELP-ACCESS-2 — Unauthenticated user redirected

- GIVEN a user who is not authenticated
- WHEN they navigate to `help/tutorial`
- THEN `authLoader` redirects to `/login` and the tutorial page does not render

#### Scenario: S-HELP-ACCESS-3 — No feature gate blocks access

- GIVEN an authenticated user with no special feature flags enabled
- WHEN they navigate to `help/tutorial`
- THEN the tutorial page renders without any feature-based redirect

---

### Requirement: Help Tutorial Rendered Content (HELP-CONTENT)

A page component MUST exist at `app/help/routes/tutorial.tsx`, exported as a named export AND
as `default`.

The page MUST render a heading using the i18n key `TUTORIAL.TITLE` via `useIntl`.

The page MUST render a native `<details>`/`<summary>` accordion containing exactly 4 hardcoded
Spanish steps describing "Pasos para realizar una venta". Step prose MUST be hardcoded Spanish
(no i18n required for step text).

The page MUST render exactly 6 images loaded from absolute paths under `/images/help/`
(e.g. `/images/help/menu.png`). No Vite import is used for images.

No UI library accordion component MUST be introduced; only native HTML elements are used.

#### Scenario: S-HELP-CONTENT-1 — Title renders from i18n key

- GIVEN the tutorial page is rendered inside an `IntlProvider`
- WHEN the component mounts
- THEN a heading is present whose text originates from the `TUTORIAL.TITLE` i18n key

#### Scenario: S-HELP-CONTENT-2 — Accordion contains 4 steps

- GIVEN the tutorial page renders
- THEN exactly 4 step entries are present inside the accordion
- AND each step is wrapped in a native `<details>` or `<summary>` element

#### Scenario: S-HELP-CONTENT-3 — 6 images present with /images/help/ paths

- GIVEN the tutorial page renders
- THEN exactly 6 `<img>` elements are present
- AND each `src` attribute begins with `/images/help/`

#### Scenario: S-HELP-CONTENT-4 — Accordion toggle works

- GIVEN the tutorial page renders
- WHEN the user clicks a `<summary>` element
- THEN the corresponding `<details>` element toggles its open state

---

### Requirement: Help Menu Entry (HELP-MENU)

A new sidebar menu group MUST be added to `app/shared/lib/config/menu-config.ts`.

The group MUST use i18n key `MENU.HELP` as its label.

The group MUST contain one item: Tutorial, using i18n key `MENU.TUTORIAL` with route `help/tutorial`.

The group MUST have `featureIds: []` (no feature gate — always visible to authenticated users).

#### Scenario: S-HELP-MENU-1 — Help group appears in sidebar for authenticated user

- GIVEN any authenticated user is logged in
- WHEN the sidebar renders
- THEN a menu group labelled by `MENU.HELP` is visible
- AND it contains a Tutorial item linking to `help/tutorial`

#### Scenario: S-HELP-MENU-2 — Help group has no feature gate

- GIVEN the menu config is loaded
- THEN the Help group entry has `featureIds: []`
- AND it is not hidden by any feature flag evaluation

---

### Requirement: Help Tutorial Internationalisation (HELP-I18N)

The following keys MUST be added to `app/shared/lib/i18n/es.ts`:

| Key | Purpose |
|-----|---------|
| `TUTORIAL.TITLE` | Page heading |
| `MENU.HELP` | Sidebar group label |
| `MENU.TUTORIAL` | Sidebar item label |

`en.ts` MUST NOT be modified (no English locale exists for these keys in this project).

#### Scenario: S-HELP-I18N-1 — Required keys exist at runtime

- GIVEN `es.ts` is loaded
- THEN `TUTORIAL.TITLE`, `MENU.HELP`, and `MENU.TUTORIAL` are present and non-empty

---

### Requirement: Help Tutorial Images (HELP-IMAGES)

Exactly 6 image files MUST be present under `public/images/help/` and MUST be reachable at
runtime via absolute paths such as `/images/help/menu.png`.

#### Scenario: S-HELP-IMAGES-1 — Images present in public directory

- GIVEN the React app is built or dev-served
- WHEN a request is made to `/images/help/<filename>`
- THEN each of the 6 image files returns a 200 response

---

### Requirement: Help Tutorial Testing (HELP-TEST)

A smoke-test suite MUST exist at `app/help/routes/__tests__/tutorial.test.tsx`.

Tests MUST cover:

| Scenario | Assertion |
|----------|-----------|
| Authenticated user renders page | Title heading present; 4 step elements present; 6 img elements with `/images/help/` src |
| Unauthenticated user redirected | `authLoader` redirects to `/login`; tutorial component does not render |
| No feature gate | Component renders with no feature-flag mocking required |

All test files that use `useIntl` MUST wrap the component under test in `IntlProvider`.

#### Scenario: S-HELP-TEST-1 — Render test covers title, steps, and images

- GIVEN the tutorial page is rendered inside `IntlProvider` with a mocked authenticated session
- THEN the test asserts: `TUTORIAL.TITLE` heading is present; 4 step elements are present;
  6 img elements each have `src` beginning with `/images/help/`

#### Scenario: S-HELP-TEST-2 — Auth guard test covers unauthenticated redirect

- GIVEN the tutorial route is rendered without an authenticated session
- THEN the test asserts `authLoader` caused a redirect to `/login`
- AND the tutorial component is not in the rendered output

---

## Non-Goals (Explicit Negative Requirements)

### HELP-NGOAL-1 — No i18n for step prose

Step text MUST remain hardcoded Spanish. Matching source parity is intentional.

### HELP-NGOAL-2 — No feature gate

A `featureLoader` MUST NOT be added to the `help/tutorial` route. The Angular source had none.

### HELP-NGOAL-3 — No UI library accordion

A third-party accordion component MUST NOT be introduced. Only native `<details>`/`<summary>` is used.

### HELP-NGOAL-4 — No backend calls

The page MUST NOT make any HTTP requests. It is entirely static.

### HELP-NGOAL-5 — No en.ts changes

`TUTORIAL.*` and `MENU.HELP`/`MENU.TUTORIAL` keys MUST NOT be added to `en.ts`.
