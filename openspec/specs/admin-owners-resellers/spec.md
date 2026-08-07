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

Added by `phone-validation-owner-reseller` (archived 2026-08-07). Once the frontend stops
validating phone format (`phone-requirement` capability, same change), an owner or reseller
submitted with an empty phone reaches the backend, which still requires it
(`CreateOwnerCommandValidator.cs:35`, `UpdateOwnerCommandValidator.cs:22`,
`CreateReSellerCommandValidator.cs:48`, `UpdateReSellerCommandValidator.cs:32`). The backend rejects
with HTTP 400 and a body shaped `{ errors: [{ code, description }] }`, where `code` is the
FluentValidation `PropertyName` (`ValidationException.cs:20`, `new Error(failure.PropertyName,
failure.ErrorMessage)`) and `description` is the interpolated backend message. `PropertyName`
mirrors the field name declared on the command DTO, not the validator file: `CreateOwnerCommand.cs:20`
declares `string Cellphone`; `UpdateOwnerCommand.cs:24` declares `string CellPhone`. The ReSeller
side splits identically: `CreateReSellerCommand.cs:24` declares `string Cellphone`;
`UpdateReSellerCommand.cs:18` declares `string CellPhone`. The validator's `RuleFor(x => x.Cellphone)`
/ `RuleFor(x => x.CellPhone)` just closes over whichever casing its own command record declares.

Today that 400 is swallowed into the generic `OWNER.ERROR` / `RESELLERS.ERROR` copy ("Ocurrió un
error. Intentá de nuevo.", `es.ts:765` / `es.ts:743`). This capability makes the four admin forms
render a message distinct from that generic one when the rejection is the phone-required failure,
and confines that render to the existing single-banner idiom that already exists in these four
files.

**Correction (design-phase finding, verified here)**: the mapping MUST NOT read only
`errors[0]`. FluentValidation's default class-level cascade mode is `Continue` — every declared
`RuleFor` runs and every failure is collected, in **rule-declaration order**, not phone-first order.
Verified: `CreateOwnerCommandValidator.cs` declares `RuleFor(x => x.FullName)` at `:31`, three lines
before `RuleFor(x => x.Cellphone)` at `:35`; `CreateReSellerCommandValidator.cs` declares `FullName`
at `:44` before `Cellphone` at `:48`; `UpdateOwnerCommandValidator.cs` declares `FullName` at `:18`
before `CellPhone` at `:22`; `UpdateReSellerCommandValidator.cs` declares `FullName` at `:28` before
`CellPhone` at `:32`. So a submit with BOTH `fullName` and `cellPhone` empty puts `FullName` at
`errors[0]` on all four paths, and any mapping that reads only the first element silently falls
through to the generic message — the exact failure this capability exists to fix. The mapping MUST
scan every entry of `errors` for a known code, not just the first.

The match MUST also be case-insensitive (normalize each `code` before comparing — e.g. via
`.toLowerCase()`), not a hardcoded enumeration of exactly the two observed casings. The two real
casings (`"Cellphone"`, `"CellPhone"`) come from the DTOs cited above; case-insensitive comparison
is the general form of tolerating that split rather than special-casing it twice.

**Corrected scope** (2026-08-07, supersedes an earlier design draft): the message renders in the
existing top-of-form `role="alert"` banner (`validationError || serverError`,
`owner-create.tsx:124-128`, `owner-edit.tsx:275-279`, `reseller-create.tsx:95-99`,
`reseller-edit.tsx:176-180`) — the same element that already renders `OWNER.PHONE_FORMAT` today
(`owner-create.tsx:80-81`). No new per-field error slot is introduced in any of the four files.

### Requirement: FE-OC7 — Owner Create/Update Map The Phone-Required 400 Rejection To Dedicated Copy

`owner-create.tsx` and `owner-edit.tsx` MUST render a message distinct from `OWNER.ERROR` when
`createOwner`/`updateOwner` rejects with `response.status === 400` AND the `errors` array contains
an entry whose `code`, compared case-insensitively, is the phone-required property name. Because
create and update use different casing for the same field (DTO citations above: `Cellphone` on
create, `CellPhone` on update), the classification MUST recognize both casings as the phone-required
code via case-insensitive comparison — a case-sensitive match on only one casing silently fixes half
the surface.

The classification MUST scan the WHOLE `errors` array, not just `errors[0]`. Reading only the first
element is wrong: on all four paths (owner create/update, reseller create/update — see FE-OC8) the
`FullName` rule is declared before the `Cellphone`/`CellPhone` rule (evidence in this section's
intro), so a submit with both fields empty puts `FullName` at index 0 and the phone error later in
the array. A first-element-only read would silently fall through to the generic message for exactly
the co-failure case most likely in practice (an admin clearing multiple required fields at once).

This extends the existing classification pattern (FE-OC2/FE-OC3, this same capability), which today
keys only off `response.status` (409/403 for create, 404/403 for update). This requirement adds a
new axis: for a `400` rejection specifically, classification MUST also inspect the `errors` array,
because a `400 → generic message` mapping would be wrong — every backend validation failure of any
kind arrives as `400`, not just the phone-required one.

The mapped message MUST reach the form via the rejected-promise path (the `catch` block), not the
resolved `!res.succeeded` branch. `api-client.ts`'s `apiClient` does not override `validateStatus`
(`api-client.ts:20-26`), so axios rejects on every non-2xx response; the `!res.succeeded` branch
(`owner-create.tsx:97-100`, `owner-edit.tsx:219-222`) is unreachable for this failure and MUST NOT
be relied upon to carry the mapped message.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create rejects on phone-required (create casing) | `createOwner` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'Cellphone', ... }` | The admin submits with an empty `cellPhone` | The banner (`role="alert"`) shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text |
| 2 | Update rejects on phone-required (update casing) | `updateOwner` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'CellPhone', ... }` | The admin saves with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text |
| 3 | Both casings map to the same rendered copy | Two separate rejections, one containing `{ code: 'Cellphone' }`, one containing `{ code: 'CellPhone' }` | Each is submitted through its respective page (create, update) | Both render the identical phone-required copy — the casing difference is invisible to the admin |
| 4 | Phone error found regardless of position in the array | `createOwner`/`updateOwner` rejects with `response.status === 400` and `response.data.errors === [{ code: 'FullName', ... }, { code: 'Cellphone'/'CellPhone', ... }]` (both fields empty, `FullName` occupies index 0) | The admin submits with both `fullName` and `cellPhone` empty | The banner shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text; the classifier is not fooled by `FullName` sitting at `errors[0]` |
| 5 | An unrelated 400 still falls to the generic message | `createOwner`/`updateOwner` rejects with `response.status === 400` and no entry in `response.data.errors` has code `'Cellphone'`/`'CellPhone'` (e.g. only `{ code: 'FullName' }`) | The admin submits | The banner shows `OWNER.ERROR`'s text — never blank, never the phone-required copy, never the raw backend `description` |
| 6 | A 400 with no error body still falls to the generic message | `createOwner`/`updateOwner` rejects with `response.status === 400` and `response.data.errors` is empty or absent (e.g. `response.data` itself is `undefined`) | The admin submits | The banner shows `OWNER.ERROR`'s text. This is the exact shape the existing regression tests `owner-create.test.tsx:502-504` and `owner-edit.test.tsx:647` already pin (`{ response: { status: 400 } }`, no body) — those two tests stay green, unmodified, and now serve as the fallback's regression net |

### Requirement: FE-OC8 — Reseller Create/Update Gain Status/Code-Based Error Classification (Currently Absent)

`reseller-create.tsx` and `reseller-edit.tsx` currently have bare `catch { setServerError(...) }`
blocks (`reseller-create.tsx:81-82`, `reseller-edit.tsx:132-133`) that never inspect
`error.response.status` at all — every rejection, regardless of cause, renders `RESELLERS.ERROR`.
This requirement MUST add the same phone-required classification described in FE-OC7 to both
reseller forms, including its two corrections: the match scans the WHOLE `errors` array (not just
`errors[0]` — `CreateReSellerCommandValidator.cs` declares `FullName` at `:44` before `Cellphone` at
`:48`, and `UpdateReSellerCommandValidator.cs` declares `FullName` at `:28` before `CellPhone` at
`:32`, so the same co-failure ordering trap applies here) and the code comparison is
case-insensitive. A `400` rejection whose `errors` array contains an entry with code `'Cellphone'`
(create) or `'CellPhone'` (update) MUST render the mapped phone-required copy instead of
`RESELLERS.ERROR`.

No other status-based classification is added to the reseller forms by this requirement — 409/403/
404/network-failure handling stays exactly as it is today (all fall to `RESELLERS.ERROR`, unchanged
by this delta).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Reseller create rejects on phone-required | `createReseller` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'Cellphone', ... }` | The admin submits with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 2 | Reseller update rejects on phone-required | `updateReseller` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'CellPhone', ... }` | The admin saves with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 3 | Phone error found regardless of position in the array | `createReseller`/`updateReseller` rejects with `response.status === 400` and `response.data.errors === [{ code: 'FullName', ... }, { code: 'Cellphone'/'CellPhone', ... }]` (both fields empty, `FullName` occupies index 0) | The admin submits with both `fullName` and `cellPhone` empty | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 4 | An unrelated 400 still falls to the generic message | `createReseller`/`updateReseller` rejects with `response.status === 400` and no entry in `response.data.errors` has code `'Cellphone'`/`'CellPhone'` | The admin submits | The banner shows `RESELLERS.ERROR`'s text |
| 5 | Non-400 rejections are unaffected | `createReseller`/`updateReseller` rejects with `response.status` other than 400 (e.g. 500), or rejects with no `response` at all | The admin submits | The banner shows `RESELLERS.ERROR`'s text, exactly as today — this requirement does not touch that path |

### Requirement: FE-OC9 — Every Other Error Sharing The Banner Keeps Its Current Message

The banner (`validationError || serverError`) already renders several other messages besides the
phone-required one: `OWNER.PASSWORD_POLICY`/`RESELLERS.PASSWORD_POLICY`,
`OWNER.PASSWORDS_MUST_MATCH`/`RESELLERS.PASSWORDS_MUST_MATCH`, and the existing FE-OC2/FE-OC3
classifications (`OWNER.DUPLICATE_LOGIN` on 409, `OWNER.FORBIDDEN` on 403,
`OWNER.NOT_FOUND` on 404). None of these MUST change as a result of this capability.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Password policy unaffected | The password fails `PASSWORD_REGEX` | The admin submits an owner/reseller create form | `OWNER.PASSWORD_POLICY`/`RESELLERS.PASSWORD_POLICY` is shown, unchanged |
| 2 | Passwords-must-match unaffected | `password !== confirmPassword` | The admin submits a create form | `OWNER.PASSWORDS_MUST_MATCH`/`RESELLERS.PASSWORDS_MUST_MATCH` is shown, unchanged |
| 3 | 409/403/404 classifications unaffected | `createOwner` rejects 409, or any of the four services reject 403, or `updateOwner` rejects 404 | The admin submits/saves | `OWNER.DUPLICATE_LOGIN`/`OWNER.FORBIDDEN`/`OWNER.NOT_FOUND` render exactly as FE-OC2/FE-OC3 already specify |
| 4 | The existing "unclassified 400" tests stay green, unmodified | The tests `owner-create.test.tsx:502-504` and `owner-edit.test.tsx:647` mock a rejection shaped `{ response: { status: 400 } }` with no body | Those tests run, unmodified, against the FE-OC7 implementation | They still assert `OWNER.ERROR`'s text and still pass — `response.data` is `undefined`, so no `errors` entry exists to match, and the fallback in FE-OC7 scenario 6 fires exactly as it already pins. These two tests are NOT touched by this change; they become the regression net for the fallback path |

### Requirement: FE-OC10 — No New Per-Field UI Is Introduced

The four admin forms keep exactly one error-rendering region each — the top-of-form
`role="alert"` banner. This requirement MUST NOT add a `cellPhoneError`-style per-field slot (the
pattern that exists in `UserDetailsForm.tsx:40,109-110` is NOT copied here — that precedent belongs
to a different, unrelated form and was explicitly rejected as the direction for this capability).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Single alert region persists | Any of the scenarios in FE-OC7/FE-OC8 | The mapped message renders | Exactly one `role="alert"` element exists in the DOM for that form; no new element is added near the `cellPhone` input |

## Non-Requirements (Explicit Exclusions)

- MUST NOT implement Angular's no-op stub actions: owner Approve/Activate/Deactivate; reseller Activate/Deactivate/Delete. These stay absent from gear menus.
- MUST NOT modify admin/stores, admin/features, admin/dashboard, or admin/roles (dead route).
- MUST NOT build Angular dead code (e.g., `OwnerDetailsComponent`).

## Notes — `succeeded:false` Guard Coverage

This capability covers **5 `succeeded:false` guard requirements across 6 call-sites**: `owner-list.tsx` (1), `owner-edit.tsx` (3: `getOwner`, `listResellers`, `loadStores`), and `reseller-list.tsx` (1) — the total across all three modified capabilities (this file, `admin-stores`, `management-users`) is 6 sites in 5 files, this file's `owner-edit.tsx` alone accounting for 3 of the 6.

No uniform pattern is mandated: each requirement mirrors its own file's pre-existing failure idiom. Two of `owner-edit.tsx`'s three sites are NOT the same idiom and MUST NOT be conflated: `listResellers` preserves total silence (no error UI at all), while `loadStores` reuses its own pre-existing, visible `storesError` state (`STORES.ERROR`) — distinct from the page's `loadError`. `owner-list.tsx` and `reseller-list.tsx` each use their own visible `loadError`/`error` banner, always `OWNER.ERROR`/`RESELLERS.ERROR`. `getOwner` is the one exception: since `owners-getbyid-envelope-404` (archived 2026-08-04) its `loadError` is classified by envelope `actionCode` (404 → `OWNER.NOT_FOUND`, 403 → `OWNER.FORBIDDEN`, else → `OWNER.ERROR`) rather than a flat `OWNER.ERROR`. No new i18n key or copy is introduced anywhere in this file — `OWNER.ERROR`, `RESELLERS.ERROR`, and `STORES.ERROR` all already exist (`es.ts:758`, `:736`, `:625`).
