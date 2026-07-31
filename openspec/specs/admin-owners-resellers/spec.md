# Admin Owners & Resellers Parity Specification

## Purpose

Bring React `admin/owners` and `admin/resellers` list views (web-store-pos) to strict structural and textual parity with Angular (`frontend/`), the sole source of truth. Restores the 3-col mat-card grid, gear-menu action pattern, unstyled state CSS classes, and Spanish copy drift. No new functionality; no Angular dead code or no-op stubs are built.

## Requirements — Owners (admin/owners)

### Requirement: Owners List Card Grid

The owners list MUST render a 3-column responsive card grid per Angular `row row-cols-1 row-cols-md-3` (owners.component.html:15).

#### Scenario: Desktop grid
- GIVEN an admin views `/admin/owners` at desktop width
- WHEN the list loads
- THEN owner cards render 3-per-row, one card per owner

### Requirement: Owners Gear Menu — Live Actions Only

Each owner card MUST expose a gear-icon menu with ONLY Edit and Delete, matching Angular's two real handlers — `deleteOwner` calls the API (owners.component.ts:337-343); `approveOwner`/`activateOwner`/`deactivateOwner` are empty stubs (owners.component.ts:345-355) and MUST NOT be built.

#### Scenario: Menu shows Edit and Delete only
- GIVEN an owner card
- WHEN the admin opens the gear menu
- THEN exactly Edit (→ `/admin/owners/edit/:id`) and Delete are shown
- AND no Approve/Activate/Deactivate items exist

#### Scenario: Delete removes the owner
- GIVEN the gear menu is open
- WHEN the admin confirms Delete
- THEN the owner is deleted and the list reloads

### Requirement: Owners State CSS Classes

The list MUST style `.guest-owner` and `.deactive-owner`, matching `getOwnerBackgroundColor` (owners.component.ts:357-359; owners.component.scss:3-16).

#### Scenario: Unapproved and inactive owners are visually flagged
- GIVEN an owner with `approved=false, isActive=true`
- WHEN the card renders
- THEN it applies the `.guest-owner` style
- GIVEN an owner with `isActive=false`, THEN it applies `.deactive-owner` instead

### Requirement: Owners L6 Text Parity

Owner copy MUST match Angular literally for known mismatches.

#### Scenario: Edit submit reads "Actualizar"; create title reads Angular's
- GIVEN an admin edits an existing owner
- WHEN the form renders
- THEN the submit button reads "Actualizar" (GENERAL.UPDATE), not "Adicionar"
- AND the create-owner page title reads "Adicionar Propietario" (OWNER.CREATE_TITLE)

### Requirement: Owner List Surfaces succeeded:false via OWNER.ERROR

`owner-list.tsx`'s `loadOwners` MUST treat a `succeeded: false` response from `ownerHttpService.listOwners()` the same as a thrown/rejected call: it MUST NOT call `setOwners` with the response's `data` and MUST set the error state to `OWNER.ERROR`, reusing the existing catch-branch idiom.

#### Scenario: List resolves with succeeded:false renders OWNER.ERROR, not null owners
- GIVEN `ownerHttpService.listOwners()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadOwners` runs
- THEN `owners` state is NOT set to `null`
- AND the error banner is set to `OWNER.ERROR`

### Requirement: Owner Edit Load Surfaces succeeded:false via OWNER.ERROR

`owner-edit.tsx`'s `getOwner(id)` load effect MUST treat `succeeded: false` the same as its existing `.catch` branch: it MUST NOT populate form fields (`setOwner`/`setFullName`/etc.) from the response's `data` and MUST set `loadError` to `OWNER.ERROR`.

#### Scenario: getOwner resolves with succeeded:false renders OWNER.ERROR, not a null-derived form
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN the load effect runs
- THEN none of the form-field setters is called with the response's data
- AND `loadError` is set to `OWNER.ERROR`, matching the existing catch branch

### Requirement: Owner Edit Reseller Dropdown Fetch Preserves Its Existing Silent-Failure Idiom

`owner-edit.tsx`'s `listResellers()` fetch for the reseller-selection dropdown currently treats a rejected promise as non-critical (empty catch, no error state). On `succeeded: false` it MUST NOT set `resellers` to `null`, but per the file's existing idiom it MUST NOT introduce a new error message — this call has no error UI today and this change MUST NOT add one.

#### Scenario: Dropdown fetch resolves with succeeded:false leaves the dropdown empty, no new error UI
- GIVEN `resellerHttpService.listResellers()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN the reseller-loading effect runs
- THEN `resellers` is NOT set to `null` (falls back to `[]`/unset)
- AND no new error message or banner renders as a result

### Requirement: Owner Edit Stores Tab Fetch Surfaces succeeded:false via Its Own storesError State

`owner-edit.tsx`'s `loadStores()` (Tiendas tab, `owner-edit.tsx:85-93`) already has a real, visible failure idiom distinct from the page's main `loadError`: a dedicated `storesError` state set via `setStoresError(intl.formatMessage({ id: 'STORES.ERROR' }))` in its existing catch branch. On `succeeded: false` it MUST NOT call `setStores` with the response's `data` and MUST set `storesError` (not `loadError`, and not a new key) to `STORES.ERROR`, reusing that dedicated state.

#### Scenario: Stores tab fetch resolves with succeeded:false renders STORES.ERROR in storesError, not the page error
- GIVEN `storeHttpService.listStores()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadStores()` runs inside `owner-edit.tsx`
- THEN `stores` state is NOT set to `null`
- AND `storesError` (not `loadError`) is set to `STORES.ERROR`, matching the existing catch branch

## Requirements — Resellers (admin/resellers)

### Requirement: Resellers List Card Grid

The resellers list MUST render a 3-column responsive card grid per Angular `row row-cols-1 row-cols-md-3` (resellers.component.html:14).

#### Scenario: Desktop grid
- GIVEN an admin views `/admin/resellers` at desktop width
- WHEN the list loads
- THEN reseller cards render 3-per-row

### Requirement: Resellers Gear Menu — Edit Only

Each reseller card MUST expose a gear menu with ONLY Edit, since Angular's Activate/Deactivate/Delete reseller handlers are empty stubs (resellers.component.ts:47-61) and MUST NOT be built.

#### Scenario: Menu shows Edit only
- GIVEN a reseller card
- WHEN the admin opens the gear menu
- THEN exactly one item, Edit (→ `/admin/resellers/edit/:id`), is shown
- AND no Activate/Deactivate/Delete items exist

### Requirement: Reseller List Surfaces succeeded:false via RESELLERS.ERROR

`reseller-list.tsx`'s `loadResellers` MUST treat `succeeded: false` from `resellerHttpService.listResellers()` the same as its existing catch branch: it MUST NOT call `setResellers` with the response's `data` and MUST set the error state to `RESELLERS.ERROR`.

#### Scenario: List resolves with succeeded:false renders RESELLERS.ERROR
- GIVEN `resellerHttpService.listResellers()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadResellers` runs
- THEN `resellers` state is NOT set to `null`
- AND the error banner is set to `RESELLERS.ERROR`

### Requirement: Resellers State CSS Class

The list MUST style `.deactive-reSeller`, matching `getReSellerBackgroundColor` (resellers.component.ts:63-65; resellers.component.scss:8-11).

#### Scenario: Inactive reseller is visually flagged
- GIVEN a reseller with `isActive=false`
- WHEN the card renders
- THEN it applies the `.deactive-reSeller` style

### Requirement: Resellers L6 Text Parity

Reseller copy MUST match Angular literally for all 6 known mismatches.

#### Scenario: List/add/discount labels match Angular
- GIVEN an admin views `/admin/resellers`
- WHEN the page renders
- THEN the list title reads "Gestores" (RESELLERS.LIST_TITLE) and the list FAB action reads "Adicionar" (RESELLERS.ADD); the create-page title separately reads "Adicionar Gestor" (RESELLERS.CREATE_TITLE)
- AND discount labels read "Porciento de descuento" / "Descuento" (RESELLERS.PERCENT_DISCOUNT / RESELLERS.DISCOUNT_PRICE)

#### Scenario: Edit submit is dynamic
- GIVEN an admin edits an existing reseller
- WHEN the form renders
- THEN the submit button reads "Actualizar" (GENERAL.UPDATE); on create it reads "Adicionar" (GENERAL.ADD)

### Requirement: ReSeller Model Retains login Field (Angular's Own Model Is Stale)

The `ReSeller` TypeScript model (`packages/domain/src/models/store.ts`) MUST keep its `login?:
string` field, even though Angular's `domain/resellers/reseller.model.ts` interface omits it.
This is a ratified deviation from the original design/spec draft (which called for removal as a
rule-12 invention): source-grep proved a live consumer — `reseller-edit.tsx:80`
(`setLogin(r.login ?? '')`) mirrors Angular's own `edit-reseller-details.component.ts:129`, which
declares a disabled `login` `FormGroup` control populated via `patchValue(reSeller)` from the
real API response. Angular's declared model is stale relative to its own runtime contract; parity
is measured against Angular's actual behavior, not its (incomplete) TypeScript interface.

**Rules**: 3 (behavior/runtime-contract parity over stale declared-type parity), 12 (not an
invention — mirrors a real, if undeclared, Angular consumer).

#### Scenario: ReSeller model keeps the login field
- GIVEN the React `ReSeller` interface
- WHEN inspected against Angular's runtime `edit-reseller-details.component.ts:129` disabled
  `login` form control (not just Angular's declared `reseller.model.ts` interface)
- THEN React's `ReSeller.login?: string` field remains present

#### Scenario: reseller-edit surfaces the field as disabled, mirroring Angular
- GIVEN a reseller record fetched from the API includes a `login` value
- WHEN `reseller-edit.tsx` renders
- THEN it calls `setLogin(r.login ?? '')`, mirroring Angular's disabled `login` control populated
  via `patchValue(reSeller)`

## Non-Requirements (Explicit Exclusions)

- MUST NOT implement Angular's no-op stub actions: owner Approve/Activate/Deactivate; reseller Activate/Deactivate/Delete. These stay absent from gear menus.
- MUST NOT modify admin/stores, admin/features, admin/dashboard, or admin/roles (dead route).
- MUST NOT build Angular dead code (e.g., `OwnerDetailsComponent`).

## Notes — `succeeded:false` Guard Coverage

This capability covers **5 `succeeded:false` guard requirements across 6 call-sites**: `owner-list.tsx` (1), `owner-edit.tsx` (3: `getOwner`, `listResellers`, `loadStores`), and `reseller-list.tsx` (1) — the total across all three modified capabilities (this file, `admin-stores`, `management-users`) is 6 sites in 5 files, this file's `owner-edit.tsx` alone accounting for 3 of the 6.

No uniform pattern is mandated: each requirement mirrors its own file's pre-existing failure idiom. Two of `owner-edit.tsx`'s three sites are NOT the same idiom and MUST NOT be conflated: `listResellers` preserves total silence (no error UI at all), while `loadStores` reuses its own pre-existing, visible `storesError` state (`STORES.ERROR`) — distinct from the page's `loadError`. `getOwner`, `owner-list.tsx`, and `reseller-list.tsx` each use their own visible `loadError`/`error` banner (`OWNER.ERROR`/`RESELLERS.ERROR`). No new i18n key or copy is introduced anywhere in this file — `OWNER.ERROR`, `RESELLERS.ERROR`, and `STORES.ERROR` all already exist (`es.ts:759`, `:737`, `:626`).
