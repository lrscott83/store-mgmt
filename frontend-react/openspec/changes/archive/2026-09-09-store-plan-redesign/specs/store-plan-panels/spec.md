# store-plan-panels Specification

**Change:** store-plan-redesign
**Phase:** Spec
**Status:** Draft
**Date:** 2026-09-09
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Replace the tabbed PlanPicker with three collapsible plan panels (Gratis/Pago/Superior) in the two
edit contexts — owner plan modal and admin plan page. Panels render from a real backend plan catalog
(`GET /v1/plans`) and the store's serialized `planType`, retiring the `priceIncluded` active-plan
heuristic that misclassifies seeded Gratis stores. "Activar ese plan" saves immediately. DG-7 lock stays.

---

## Requirements

### Requirement: Plan Catalog Contract (CATALOG)

The backend MUST expose a read-only `GET /v1/plans` returning exactly the active **Gratis, Pago and
Superior** plans (VIP MUST NOT be returned), each with its member modules (name, order,
`priceIncluded`, `price`, `currentPrice`, `discountText`, FeatureDescriptions) and a computed plan
price = Σ member `currentPrice` via `CurrentPriceServiceUtils` (same util as the module catalog).
Access MUST be restricted to SuperAdmin/OwnerAdmin (StoresAdmin-equivalent); no plan, module, or
billing behavior changes. `StorePlanDto` and `OwnerStoreWithPlan` MUST serialize `planType` — the
store's current plan name (Gratis, Pago, or Superior) — so the frontend never infers it.

#### Scenario: Catalog returns the three paid-eligible plans

- GIVEN an authenticated SuperAdmin or OwnerAdmin calls `GET /v1/plans`
- WHEN the response resolves
- THEN it contains exactly Gratis, Pago and Superior, each with its seeded member modules and a price equal to the Σ of member `currentPrice`

#### Scenario: VIP is excluded

- GIVEN the seeded catalog contains a VIP plan
- WHEN `GET /v1/plans` resolves
- THEN VIP is absent from the response

#### Scenario: Read-only surface

- GIVEN any authenticated StoresAdmin caller
- WHEN they invoke any plan-modifying verb (PUT/POST/DELETE on plans)
- THEN the request fails with 404/405 — this endpoint MUST NOT mutate plan or billing state

#### Scenario: Unauthorized caller denied

- GIVEN an authenticated user who is neither SuperAdmin nor OwnerAdmin
- WHEN they call `GET /v1/plans`
- THEN the request is rejected (403/401) and no plan data is returned

#### Scenario: planType serialized on store DTOs

- GIVEN a store on the Pago plan (seeded membership includes paid-flagged modules)
- WHEN its `StorePlanDto` or `OwnerStoreWithPlan` is fetched
- THEN `planType` equals "Pago" and does NOT contradict seeded membership

### Requirement: Frontend Catalog Access (SERVICE)

`storeHttpService` MUST expose `getPlans()` → `GET /v1/plans` and `getFeaturesToStore()` →
`GET /v1/Features/available`, both through the shared `apiClient` (Bearer interceptor + 401 logout).
All consumers MUST surface fetch errors inline without crashing.

#### Scenario: Service methods resolve

- GIVEN an authenticated online user opens the plan page or owner modal
- WHEN `getPlans()` and `getFeaturesToStore()` are called
- THEN both resolve through `apiClient` with typed response models

#### Scenario: Catalog fetch failure

- GIVEN `getPlans()` rejects with a network or HTTP error
- WHEN the plan page or modal renders
- THEN an inline error is shown and no panels are rendered from partial data

### Requirement: Three-Panel Plan UI (PANELS)

The owner plan modal and the admin plan page (`/management/stores`) MUST render the plans from
`GET /v1/plans` as three collapsible panels — Gratis, Pago, Superior — each listing its member
modules with `currentPrice`, strike-through original price when discounted, and a Σ `currentPrice`
total (Angular module-table parity anchor). The panel whose plan matches the store's `planType`
MUST be default-expanded; the others MUST be collapsed. No panel content MAY derive membership or
pricing from the `priceIncluded` heuristic.

#### Scenario: Three panels render from real membership

- GIVEN `GET /v1/plans` returns Gratis/Pago/Superior with their seeded modules
- WHEN the owner modal or plan page renders
- THEN three collapsible panels appear and each lists exactly the backend-declared member modules with per-module prices and a Σ total

#### Scenario: Active panel expands from planType, not the heuristic

- GIVEN a store whose `planType` is Gratis and whose membership includes Reports (a paid-flagged module)
- WHEN the panels render
- THEN the Gratis panel is default-expanded — the paid-flag on Reports MUST NOT classify the store as paid

#### Scenario: Only the active panel is expanded

- GIVEN a Pago store renders the three panels
- WHEN it first mounts
- THEN the Pago panel is expanded and Gratis/Superior are collapsed

### Requirement: Feature Tooltips (TOOLTIP)

Each module row MUST render a "?" affordance whose content is the real backend Feature description
(`FeatureDto.Description` from `GET /v1/Features/available`). If the feature fetch fails, tooltips
MUST be suppressed without crashing the panels.

#### Scenario: Tooltip shows the real description

- GIVEN a module with a Feature that has a `Description` in the catalog
- WHEN the user activates the "?" affordance
- THEN the tooltip renders that exact description text

#### Scenario: Tooltip data unavailable

- GIVEN `getFeaturesToStore()` rejects
- WHEN the panels render
- THEN the "?" affordances are hidden and no error interrupts the panel layout

### Requirement: Immediate Activation (ACTIVATE)

Each non-active panel MUST render an "Activar ese plan" action (owner modal + plan page). Activating
MUST immediately call `updateStore(moduleIds)` with the plan's member module ids, then
`getUserByToken()` to refresh the session, then close the modal (owner modal) or reflect the
activated plan without a reload (plan page). The picker's Guardar button (page AND modal) MUST be
removed; the store form's own submit Guardar stays (out of this capability's scope). On activation
failure the UI MUST show an inline error, MUST NOT close the modal, and MUST NOT mutate local state
as if activated.

#### Scenario: Activate from the owner modal

- GIVEN an owner with a free store viewing the plan modal
- WHEN they click "Activar ese plan" on the Superior panel
- THEN `updateStore(id, { moduleIds: superiorIds })` is called, `getUserByToken()` refreshes the session, and the modal closes

#### Scenario: Activate from the plan page

- GIVEN an admin on `/management/stores` viewing a store's panels
- WHEN they click "Activar ese plan" on a different plan
- THEN the update and session refresh run and the page reflects the new plan without a reload

#### Scenario: Activation failure

- GIVEN `updateStore()` rejects with a 4xx/5xx error during activation
- WHEN the user clicked "Activar ese plan"
- THEN an inline error appears, the modal stays open, and no panel is marked active

#### Scenario: No Guardar on picker surfaces

- GIVEN the owner modal or plan page renders panels
- WHEN the user inspects the action area
- THEN no "Guardar" button exists for the plan — the only plan action is per-panel "Activar ese plan"

### Requirement: DG-7 Lock (LOCK)

When the viewer is NOT a SuperAdmin AND the store's `planType` is a paid plan (Pago or Superior),
the panels MUST be view-only: no "Activar ese plan" action on any panel, active panel still
default-expanded, prices and membership still visible.

#### Scenario: Paid store is locked for the owner

- GIVEN an owner (not SuperAdmin) whose store has `planType` Pago
- WHEN they open the plan modal
- THEN all panels render read-only with the Pago panel expanded and no activation action anywhere

#### Scenario: Free store stays activatable

- GIVEN an owner whose store has `planType` Gratis
- WHEN they open the plan modal
- THEN every paid panel shows "Activar ese plan"

### Requirement: Internationalisation (I18N)

`es.ts` MUST add: a Superior plan-name key, the "Activar ese plan" activation copy, and per-plan
INCLUDES copy. All panel strings MUST come from `useIntl`/`FormattedMessage`; no hardcoded literals.

#### Scenario: New keys exist and are used

- GIVEN the panels render in the es locale
- THEN plan names, activation copy, and INCLUDES lists resolve from `es.ts` keys and no raw literals appear

### Requirement: E2E Coverage (E2E)

The authorized E2E specs MUST be updated to the panel UI: `store-plan-activation.spec.ts` S2-01 and
`store-plan-lock-regression.spec.ts` S2-02 (tab interactions → panel interactions, DG-7 assertions
preserved). No other existing E2E test MAY be modified.

#### Scenario: Authorized plans E2E follow the panels

- GIVEN S2-01 (owner activates paid plan once) and S2-02 (DG-7 lock regression)
- WHEN they run against the panel UI
- THEN their tab-based steps target panels and their DG-7 assertions still hold

#### Scenario: Untouched E2E suites stay green

- GIVEN the change ships the panel UI
- WHEN `store-create-security.spec.ts` runs
- THEN it passes unmodified — it never interacted with plan UI

---

## Non-Goals

- **VIP**: no VIP plan UI or catalog entry.
- **No plan UI in the store form**: create and admin-edit forms carry no plan/module picker —
  covered by the `management` delta; new stores land on Superior via the backend default.
- **Baseline guard**: the pre-existing 13 typecheck errors / 24 test failures MUST NOT grow.