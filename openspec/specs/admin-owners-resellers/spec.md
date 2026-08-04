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

### Requirement: Owner Edit Load Classifies succeeded:false By actionCode (OWNER.NOT_FOUND / OWNER.FORBIDDEN / OWNER.ERROR)

`owner-edit.tsx`'s `getOwner(id)` load effect MUST treat a `succeeded: false` response the same
as its existing `.catch` branch — it MUST NOT populate form fields (`setOwner`/`setFullName`/etc.)
from the response's `data`. The resulting `loadError` key MUST now be derived from the envelope's
`actionCode` through the same classification map the `.catch` branch already uses
(`ownerErrorMessageId`): `actionCode: 404 -> OWNER.NOT_FOUND`, `actionCode: 403 -> OWNER.FORBIDDEN`,
any other `actionCode` — including `400`, `null`, or an unmapped value — falls through to
`OWNER.ERROR`, matching today's unconditional default. A real HTTP rejection (`.catch`,
`error.response.status`) keeps precedence over the envelope arm exactly as before; this
requirement only widens classification of the resolved-but-unsucceeded envelope, it does not
change rejection handling.

(Previously: any `succeeded: false` response, regardless of `actionCode`, unconditionally set
`loadError` to `OWNER.ERROR`.)

#### Scenario: getOwner resolves with succeeded:false, actionCode 404 renders OWNER.NOT_FOUND
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: 404, data: null, errors: [...] }`
- WHEN the load effect runs
- THEN none of the form-field setters is called with the response's data
- AND `loadError` is set to `OWNER.NOT_FOUND`, not `OWNER.ERROR`

#### Scenario: getOwner resolves with succeeded:false, actionCode 400 still renders OWNER.ERROR
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: 400, data: null, errors: [{ code: 'OwnerId', ... }] }`
- WHEN the load effect runs
- THEN none of the form-field setters is called with the response's data
- AND `loadError` is set to `OWNER.ERROR` — no key exists for 400 and none is invented

#### Scenario: getOwner resolves with succeeded:false, actionCode null renders OWNER.ERROR
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: null, data: null, errors: [...] }`
- WHEN the load effect runs
- THEN `loadError` is set to `OWNER.ERROR`, matching the existing catch-branch default

#### Scenario: A real HTTP rejection is classified through the same map
- GIVEN `ownerHttpService.getOwner(id)` rejects with `error.response.status === 404`
- WHEN the load effect's `.catch` branch runs
- THEN `loadError` is set to `OWNER.NOT_FOUND` via the rejection channel
- AND this is NEW behaviour, not preserved behaviour: today that `.catch` takes no parameter
  and renders `OWNER.ERROR` unconditionally (`owner-edit.tsx:166-168`). Only the SUBMIT path
  classifies rejections. This scenario must RED before it passes.

#### Scenario: The rejection channel keeps precedence over the envelope channel
- GIVEN an input that carries both `error.response.status` and a top-level `actionCode`
- WHEN the classifier runs
- THEN the key derived from `response.status` wins
- AND no real producer emits both shapes — an axios rejection has no top-level `actionCode`
  and a resolved envelope has no `response` — so this is pinned by a synthetic case, guarding
  the contract rather than an observed collision

Added by `owners-getbyid-envelope-404` (archived 2026-08-04). Scope boundary held by that change:
the UPDATE submit branch (`owner-edit.tsx:214-217`, which surfaces `res.errors[0]?.description`)
is unchanged — tracked as a follow-up, not fixed here. `owner-create.tsx`'s FE-OC2 classification
(409/403 via `error.response.status`) is also unchanged: rejections keep precedence over any
envelope arm, and existing FE-OC2 tests are the regression guard for that page. No new i18n keys,
models, or mappers were introduced — `OWNER.NOT_FOUND` (`es.ts:766`), `OWNER.FORBIDDEN`
(`es.ts:765`), and `BaseResponseModel.actionCode: number | null` (`base.ts:14-15`) already existed
and were reused as-is.

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

## Requirements — Owner Service Contract & Error Classification (Frontend)

Added by `owners-contract-frontend` (archived 2026-08-04). The backend changed the Owners create
and update contracts (`owners-create-endpoint-fixes`, `owners-update-endpoint-fixes`, both merged
to `main`); this section makes the React client's declared types and error handling tell the
truth about those contracts.

### Requirement: FE-OC1 — Owner Service Response Types Match The Backend Contract

`ownerHttpService.createOwner` and `ownerHttpService.updateOwner` MUST declare
`Promise<BaseResponseModel<Owner>>`. The backend returns `ResponseResult<OwnerDto>` from both
(`OwnersController` create → 201, update → 200), and the domain `Owner`
(`packages/domain/src/models/store.ts:63-75`) already matches that DTO field for field.

No new model, alias, or mapper is introduced — the existing `Owner` is the type.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create returns the entity | Backend responds 201 with an `OwnerDto` body | `createOwner(payload)` resolves | `res.succeeded === true` and `res.data` is the `Owner`, with `data.id` non-empty |
| 2 | Update returns the entity | Backend responds 200 with an `OwnerDto` body | `updateOwner(id, payload)` resolves | `res.succeeded === true` and `res.data` is the `Owner` |
| 3 | Types compile | The generics are `BaseResponseModel<Owner>` | `pnpm typecheck` runs | Exit 0 — no call site reads `data` as `string` or `boolean` |

### Requirement: FE-OC2 — Create Surfaces Its Business Failures Distinctly

The create page MUST classify a rejected create by HTTP status and render a distinct message for
each business failure, because `apiClient` rejects every non-2xx and today all of them collapse into
`OWNER.ERROR`.

| Status | Message key |
|---|---|
| 409 (`Owner.DuplicateLogin`) | `OWNER.DUPLICATE_LOGIN` |
| 403 | `OWNER.FORBIDDEN` |
| any other rejection | `OWNER.ERROR` |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Duplicate login | `createOwner` rejects with `response.status === 409` | The admin submits a valid form | `OWNER.DUPLICATE_LOGIN` text is shown in the `role="alert"` region; no navigation occurs |
| 2 | Forbidden | `createOwner` rejects with `response.status === 403` | The admin submits | `OWNER.FORBIDDEN` is shown; no navigation |
| 3 | Unclassified rejection | `createOwner` rejects with `response.status === 400` | The admin submits | `OWNER.ERROR` is shown |
| 4 | Network failure | `createOwner` rejects with no `response` (`isNetworkError`) | The admin submits | `OWNER.ERROR` is shown — a transport failure is never reported as a business failure |
| 5 | Success unchanged | `createOwner` resolves `succeeded: true` | The admin submits | Navigation to `/management/stores/create`, exactly as today |

### Requirement: FE-OC3 — Update Surfaces Its Business Failures Distinctly

The edit page MUST classify a rejected update by HTTP status.

| Status | Message key |
|---|---|
| 404 (owner no longer exists) | `OWNER.NOT_FOUND` |
| 403 | `OWNER.FORBIDDEN` |
| any other rejection | `OWNER.ERROR` |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Owner deleted meanwhile | `updateOwner` rejects with `response.status === 404` | The admin saves | `OWNER.NOT_FOUND` is shown; the form stays mounted and dirty |
| 2 | Forbidden | `updateOwner` rejects with `response.status === 403` | The admin saves | `OWNER.FORBIDDEN` is shown |
| 3 | Unclassified rejection | `updateOwner` rejects with `response.status === 400` | The admin saves | `OWNER.ERROR` is shown |
| 4 | Network failure | `updateOwner` rejects with no `response` | The admin saves | `OWNER.ERROR` is shown |

### Requirement: FE-OC4 — The Update Snapshot Comes From The Persisted Entity

After a successful update the edit page MUST rebuild its dirty-check snapshot from `res.data` (the
entity the server persisted) rather than from local form state, so the dirty indicator reflects what
was saved rather than what was typed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Snapshot from response | `updateOwner` resolves with an `Owner` whose `fullName` differs from the typed value (server normalisation) | The admin saves | The snapshot holds the server's `fullName`, and the form is not dirty against it |
| 2 | Stays on page | `updateOwner` resolves successfully | The admin saves | No navigation — the page remains, per the existing ADR-5 behaviour |

### Requirement: FE-OC5 — New Message Keys Exist In Spanish

`OWNER.DUPLICATE_LOGIN`, `OWNER.FORBIDDEN` and `OWNER.NOT_FOUND` MUST exist in
`app/shared/lib/i18n/es.ts` alongside the other `OWNER.*` keys.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Keys resolve | The three keys are added | A page formats each id | Spanish copy renders, with no react-intl missing-message warning |

### Requirement: FE-OC6 — The Interceptor's 401 And 500 Paths Are Untouched

Status classification MUST be confined to 403/404/409 inside the two page components. The
`apiClient` interceptor's behaviour MUST NOT change: a 401 still does NOT log the user out
(offline-first, `api-client.ts:82-84`) and a 500 still raises the blocking dialog exactly once
(`api-client.ts:86-93`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | 500 not double-reported | `createOwner`/`updateOwner` reject with `response.status === 500` | The admin submits | The page shows `OWNER.ERROR` and raises no second dialog of its own |
| 2 | 401 does not end the session | A request rejects with `response.status === 401` | The rejection propagates | The auth store is untouched — no logout, no redirect |

#### Verification status

Verified PASS by `sdd-verify` (archived 2026-08-04, `owners-contract-frontend`). Both scenarios of
FE-OC6 have direct runtime coverage on both `owner-create.test.tsx` and `owner-edit.test.tsx` (the
edit-page pair was added as a post-verify follow-up closing the report's SUGGESTION #1 — see the
archived change's `verify-report.md` "Follow-up" section for the exact test names and gate re-run).

## Non-Requirements (Explicit Exclusions)

- MUST NOT implement Angular's no-op stub actions: owner Approve/Activate/Deactivate; reseller Activate/Deactivate/Delete. These stay absent from gear menus.
- MUST NOT modify admin/stores, admin/features, admin/dashboard, or admin/roles (dead route).
- MUST NOT build Angular dead code (e.g., `OwnerDetailsComponent`).

## Notes — `succeeded:false` Guard Coverage

This capability covers **5 `succeeded:false` guard requirements across 6 call-sites**: `owner-list.tsx` (1), `owner-edit.tsx` (3: `getOwner`, `listResellers`, `loadStores`), and `reseller-list.tsx` (1) — the total across all three modified capabilities (this file, `admin-stores`, `management-users`) is 6 sites in 5 files, this file's `owner-edit.tsx` alone accounting for 3 of the 6.

No uniform pattern is mandated: each requirement mirrors its own file's pre-existing failure idiom. Two of `owner-edit.tsx`'s three sites are NOT the same idiom and MUST NOT be conflated: `listResellers` preserves total silence (no error UI at all), while `loadStores` reuses its own pre-existing, visible `storesError` state (`STORES.ERROR`) — distinct from the page's `loadError`. `owner-list.tsx` and `reseller-list.tsx` each use their own visible `loadError`/`error` banner, always `OWNER.ERROR`/`RESELLERS.ERROR`. `getOwner` is the one exception: since `owners-getbyid-envelope-404` (archived 2026-08-04) its `loadError` is classified by envelope `actionCode` (404 → `OWNER.NOT_FOUND`, 403 → `OWNER.FORBIDDEN`, else → `OWNER.ERROR`) rather than a flat `OWNER.ERROR`. No new i18n key or copy is introduced anywhere in this file — `OWNER.ERROR`, `RESELLERS.ERROR`, and `STORES.ERROR` all already exist (`es.ts:758`, `:736`, `:625`).
