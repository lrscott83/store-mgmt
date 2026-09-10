# Delta Spec: Management — Stores sub-domain (plan UI removal)

**Change:** store-plan-redesign
**Phase:** Spec
**Status:** Draft
**Date:** 2026-09-09
**Mode:** Hybrid (engram + openspec file)

---

Delta over `openspec/specs/management/spec.md` (Stores sub-domain). Locked decisions: the store
form carries NO plan/module UI in create OR admin-edit; new stores are created on the Superior plan
(backend default); plan editing lives only on the plan page (`/management/stores`) and the owner
modal; `MENU.STORES_PLAN` is removed; the store form's own submit Guardar is untouched. All
unchanged requirements are copied verbatim per the copy-full-block rule so archiving loses nothing.

## MODIFIED Requirements

### Requirement: Store Create Container (CREATE)

**CREATE-1** — Create mode MUST be served by the shared page at
`app/management/stores/routes/edit-store.tsx` (`EditStorePage`) when no store is selected:
`storeId` resolves from the `:id` route param first, falling back to
`user.selectedStoreId`; create mode is entered when `storeId` is absent (route
`/management/stores/create`). The page MUST export `EditStorePage` as a named export and as
`default`. (Correction 2026-09-09: specs originally named `store-create.tsx`; that file does
not exist — the real unified container is `edit-store.tsx`.)

**CREATE-2** — On mount the container MUST NOT fetch the module catalog for a plan picker; no plan
picker is part of the create flow. In create mode the container MUST fetch the plan catalog
(`GET /v1/plans`) to resolve the Superior plan's member module ids for birth provisioning.
(Previously: the container fetched the module catalog and passed it to `StoreForm` as the available module list.)

**CREATE-3** — Submit calls `storeHttpService.create(payload)` (online only). The payload MUST
carry `moduleIds` = the Superior plan's member module ids resolved from `GET /v1/plans` — the
backend requires a non-empty `moduleIds` (validator + E2E pin 400 with empty) and grants exactly
those modules; the store's entity plan defaults to Superior (`CreateStoreService` L45), so a full
Superior module set makes the store born on the Superior plan with coherent modules and DG-7.
Never a user-chosen plan/module selection.
(Previously: the payload included `moduleIds` = the ids of all selected modules at submit time.)

**CREATE-4** — On successful create the container MUST navigate to `/management/stores` (the list).
It MUST NOT navigate to any users route, because the users sub-slice ships in a later change.

**CREATE-5** — Submit MUST be blocked and an offline error shown when `useOnlineStatus` returns
`false`.

**CREATE-6** — On HTTP error the container MUST pass the error to `StoreForm` for inline display;
no redirect occurs.

#### Scenario: S-CREATE-NOPLAN — create submits without module selection

- GIVEN an authorised online user on `/management/stores/create` with no plan UI rendered
- WHEN they fill the data fields and submit
- THEN the create payload contains no `moduleIds`
- AND the created store is on the Superior plan (backend default)

### Requirement: Store Edit Container (EDIT)

**EDIT-1** — Edit mode MUST be served by the shared page at
`app/management/stores/routes/edit-store.tsx` (`EditStorePage`) when a store is selected, with the
id resolved from the `:id` route param first, falling back to `user.selectedStoreId`. The
data-only update view MUST remain reachable through the thin wrapper
`app/management/stores/routes/update-store.tsx` (`UpdateStorePage`, which renders
`EditStorePage includePlan={false}`). Both MUST export their page as a named export and as
`default`. (Correction 2026-09-09: specs originally named `store-edit.tsx`; that file does not
exist — the real unified container is `edit-store.tsx` with the `update-store.tsx` wrapper.)

**EDIT-2** — On mount the container MUST fetch the store by id. The id MUST be resolved from the
`:id` route param; if the param is absent it MUST fall back to `useAuthStore.getState().user?.selectedStoreId`.

**EDIT-3** — On mount the container MUST NOT fetch the module catalog; the admin edit form carries
no plan UI.
(Previously: the container also fetched the module catalog, possibly in parallel with the store.)

**EDIT-4** — The container MUST NOT merge store modules into a catalog.
(Previously: it merged `store.modules` into the catalog, marking `selected = true` and overriding price/currentPrice/discountText from the store record.)

**EDIT-5** — Submit calls `storeHttpService.update(id, payload)` (online only). The payload MUST
carry the data-only update shape and MUST NOT include `moduleIds` — the backend leaves the plan
untouched when the field is absent.
(Previously: the payload included `moduleIds` of selected modules plus the full update shape.)

**EDIT-6** — On successful update the container MUST navigate back to `/management/stores`.

**EDIT-7** — Submit MUST be blocked and an offline error shown when `useOnlineStatus` returns
`false`.

**EDIT-8** — On HTTP error the container MUST pass the error to `StoreForm` for inline display; no
redirect occurs.

#### Scenario: S-EDIT-NOPLAN — admin edit submit omits modules

- GIVEN an authorised online user editing `/management/stores/edit/42` with no plan UI rendered
- WHEN they modify data fields and submit
- THEN the update payload contains no `moduleIds`
- AND the store keeps its current plan and modules

### Requirement: Presentational Components (PRES)

**PRES-1** — `StoreList` MUST be a pure presentational component at
`app/management/stores/components/StoreList.tsx`. It MUST accept stores as props and emit action
callbacks (onActivate, onApprove, onDisapprove, onDeactivate, onEdit, onCreate). It MUST NOT
import HTTP services or router navigation directly.

**PRES-1a** — `onActivate` and `onDeactivate` MUST be optional props in `StoreListProps`. When a
handler is absent, the corresponding action button MUST NOT be rendered. When a handler is
present, the button MUST be rendered and function exactly as before. `onApprove` and `onDisapprove`
remain required.

**PRES-2** — `StoreList` MUST show a visible degraded-state indicator when passed a degraded-mode
flag from the container (indicating data came from cache, not the network).

**PRES-3** — `StoreList` MUST show an empty-state message when the stores array is empty.

**PRES-4** — `StoreForm` MUST be a shared presentational component at
`app/management/stores/components/StoreForm.tsx`. It MUST handle both create and edit mode (the
container passes a mode prop or an initial store value to distinguish them).

**PRES-5** — `StoreForm` MUST NOT render any module/plan picker in create OR edit mode; plan
editing exists only on the plan page (`/management/stores`) and the owner modal.
(Previously: it included a module picker sub-component where `priceIncluded === true` modules were auto-selected and locked.)

**PRES-6** — `StoreForm` MUST implement role-conditional field rendering:

- super-admin or owner-admin: render `ownerId` (required, owner picker), `approved`, `description`.
- super-admin + edit mode: render `paymentStartDate` (required).
- super-admin: render `isActive`.
- Non-owner-admin creating a new store: `ownerId` is set to the current user's id (not a picker) and `approved` is forced to `false` (not rendered as editable).

**PRES-7** — `StoreForm` MUST surface an inline error message when the container passes an error
prop. It MUST NOT reset field values on error.

**PRES-8** — `StoreForm` MUST disable its submit button and show an offline notice when the
container passes an `isOnline = false` prop.

**PRES-9** — `StoreForm` MUST NOT display a module total price; the Σ `currentPrice` total is
rendered by the plan panels (see `store-plan-panels`).
(Previously: it displayed the total price of selected modules as a presentational helper.)

**PRES-10** — `StoreForm` MUST NOT import HTTP services, router hooks, or `useOnlineStatus`
directly. All data and callbacks flow through props from the container.

#### Scenario: S-PRES-NOPLAN — the form renders no plan surface in either mode

- GIVEN a StoreForm mounted in create mode or in admin-edit mode
- WHEN it renders
- THEN no module picker, no plan picker, and no module total are present
- AND the form's own submit Guardar button still renders and submits the data fields

## REMOVED Requirements

### Requirement: Module Selection (MODULE)

**MODULE-1** — When `StoreForm` mounts in create mode, it displays the full module catalog; no modules pre-selected unless `priceIncluded === true`.

**MODULE-2** — When `StoreForm` mounts in edit mode, modules in `store.modules` pre-selected with price/currentPrice/discountText overridden from the store record.

**MODULE-3** — Modules with `priceIncluded === true` auto-selected and locked.

**MODULE-4** — Submitted `moduleIds` = ids of all currently selected modules.

**MODULE-5** — Running Σ `currentPrice` total displayed in the form.

(Reason: locked decision — no plan UI in the store form, create or admin-edit; new stores land on
Superior via the backend default; module editing moved off the form entirely.)
(Migration: superseded by the `store-plan-panels` capability (panels show membership, prices and
Σ total from `GET /v1/plans`); acceptance scenarios S-MODULE-1 and S-MODULE-2 are superseded by
the PANELS scenarios of that spec.)

## ADDED Requirements

### Requirement: Menu and Entry Points (MENU)

`MENU.STORES_PLAN` (menu-config.ts L325-333) — the general-menu entry pointing at
`/management/stores` with the stale "Gratis, Básico, Profesional" help — MUST be removed. The gear
entry `owner-store-edit-plan-{id}` on the owner store cards MUST stay, and the plan page route
`/management/stores` MUST remain reachable. At least one navigation path MUST still open the plan
page for admins.

#### Scenario: S-MENU-1 — plan entry removed from the general menu

- GIVEN the management menu renders
- WHEN the user searches its items
- THEN no "Plan de la tienda" item exists and the stale plan help text is gone

#### Scenario: S-MENU-2 — gear entry stays

- GIVEN an owner's store card renders
- WHEN the user clicks the gear (`owner-store-edit-plan-{id}`)
- THEN the plan modal opens with the three panels (see `store-plan-panels`)

### Requirement: E2E Updates (E2E)

The authorized E2E specs MUST be updated to the removed menu item and the panel UI:
`owner-stores.spec.ts` E-08/E-09 (modal activation + DG-7 lock against panels) and
`store-update.spec.ts` line 58 (menu-link assertion updated to the removed item). No other existing
E2E test MAY be modified; `store-create-security.spec.ts` MUST stay green — it never interacts
with plan UI.

#### Scenario: S-E2E-MGMT — authorized specs updated, others untouched

- GIVEN the plan/panel UI changes ship
- WHEN the authorized specs run
- THEN E-08/E-09 assert panel-based modal activation and DG-7 locking, and the `store-update.spec.ts`
  menu-link assertion no longer expects "Plan de la tienda"
- AND no unauthorized E2E file, test, or assertion is changed

---

## Constraints and Non-Requirements

- **Not in scope**: VIP UI; plan price refactor; new permissions; backend behavior beyond the
  read-only plan catalog + `planType` exposure (see `store-plan-panels` CATALOG).
- **Baseline guard**: pre-existing 13 typecheck errors / 24 test failures MUST NOT grow.
- **Parity**: the 3-panel UX has no Angular counterpart (user-mandated divergence); module-price/Σ
  total semantics from the Angular module table remain the parity anchor.