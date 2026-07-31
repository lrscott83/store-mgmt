# Delta for Admin Owners & Resellers

## ADDED Requirements

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

### Requirement: Reseller List Surfaces succeeded:false via RESELLERS.ERROR

`reseller-list.tsx`'s `loadResellers` MUST treat `succeeded: false` from `resellerHttpService.listResellers()` the same as its existing catch branch: it MUST NOT call `setResellers` with the response's `data` and MUST set the error state to `RESELLERS.ERROR`.

#### Scenario: List resolves with succeeded:false renders RESELLERS.ERROR
- GIVEN `resellerHttpService.listResellers()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadResellers` runs
- THEN `resellers` state is NOT set to `null`
- AND the error banner is set to `RESELLERS.ERROR`

## Notes

- This capability now covers **5 requirements across 6 call-sites**: `owner-list.tsx` (1), `owner-edit.tsx` (3: `getOwner`, `listResellers`, `loadStores`), and `reseller-list.tsx` (1) — the change total across all three modified capabilities is 6 sites in 5 files (this file's `owner-edit.tsx` alone accounts for 3 of the 6).
- No uniform pattern is mandated: each requirement mirrors its own file's pre-existing failure idiom. Two of `owner-edit.tsx`'s three sites are NOT the same idiom and MUST NOT be conflated: `listResellers` preserves total silence (no error UI at all, unchanged by this requirement), while `loadStores` reuses its own pre-existing, visible `storesError` state (`STORES.ERROR`) — distinct from the page's `loadError`. `getOwner`, `owner-list.tsx`, and `reseller-list.tsx` each use their own visible `loadError`/`error` banner (`OWNER.ERROR`/`RESELLERS.ERROR`). No new i18n key or copy is introduced anywhere in this file — `OWNER.ERROR`, `RESELLERS.ERROR`, and `STORES.ERROR` all already exist (`es.ts:759`, `:737`, `:626`).
