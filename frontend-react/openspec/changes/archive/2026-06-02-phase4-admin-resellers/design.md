# Design: Admin Resellers (SuperAdmin Reseller CRUD)

## Technical Approach

Approach A (flat edit route) from the proposal. Mirror the established admin slice pattern
(admin/features, admin/stores, admin/dashboard): one HTTP service singleton on the shared
`apiClient`, one client container per route with `export const loader = superAdminLoader`,
inline `useState` + `useEffect` data loading, `useIntl` for i18n, inline error state, no
toast, no Context/Redux. The Angular edit shell (`EditResellerComponent` tab-group wrapping
`EditResellerDetailsComponent`) is collapsed into a single flat `ResellerEditPage` — behavior
parity, not file-structure parity. Stub list actions (activate/deactivate/delete) and dead
controls (`reSellerId`, `approveReSeller`, `getReSellerDetailsById`) are omitted. Phone is a
plain text input with a format-validation rule — no mask library.

This slice is self-contained: no new shared presentational components, no domain-package
change. `ReSeller`, `EFeatures.ReSellers`, `MENU.RESELLERS`, and the menu-config path all
already exist (verified in exploration #282).

## Architecture Decisions

### Decision: Flat edit route vs. shell + details split (ADR-1)

**Choice**: One `ResellerEditPage` container renders the details form directly. No tab-group
shell, no embedded sub-component.
**Alternatives considered**: Mirror Angular's `EditResellerComponent` (shell) +
`EditResellerDetailsComponent` (form) split.
**Rationale**: The Angular shell is pure scaffolding — a `mat-tab-group` with a single
"Details" tab and an "Add" button whose handler (`navigateToCreateReSeller()`) is an empty
stub. It carries zero semantic meaning. Every prior React admin slice is flat
(`admin/features/routes/features.tsx`, `admin/stores/routes/store-list.tsx`,
`admin/dashboard/routes/dashboard.tsx`). Splitting would add a component with no reuse and
diverge from the slice pattern. The "Add" button is dropped — list-page create navigation
already covers that path.

### Decision: No extracted presentational components — inline forms in containers (ADR-2)

**Choice**: List card grid, create form, and edit form are inline JSX inside their route
containers. No `components/` folder for this slice.
**Alternatives considered**: Extract `ResellerForm`/`ResellerList` presentational components
(as `management/users` does with `UserCreateForm`, `UserList`).
**Rationale**: `management/*` extracts components because they have multiple consumers
(create + edit reuse forms; list reused by management + admin). The reseller slice has a
single consumer per surface and no `management/resellers/` shared layer exists. admin/features
and admin/dashboard keep JSX inline in the container for the same reason. Introducing a
presentational layer here is premature abstraction. (If a second consumer appears later,
extraction is a mechanical refactor.)

### Decision: Reuse the password-validation primitive from UserCreateForm (ADR-3)

**Choice**: Copy the exact validation primitive used by
`management/users/components/UserCreateForm.tsx`:
```ts
const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;
```
On submit (parity with `UserCreateForm.handleSubmit`):
1. `if (!PASSWORD_REGEX.test(password))` → set inline validation error (`RESELLERS.PASSWORD_POLICY`), return.
2. `if (password !== confirmPassword)` → set inline validation error (`RESELLERS.PASSWORDS_MUST_MATCH`), return.
3. else call `onSubmit`/service.
**Alternatives considered**: Import a shared validator. None exists — `UserCreateForm`
inlines the regex as a module constant; there is no extracted validation util.
**Rationale**: This regex is the EXACT pattern the Angular `CreateResellerComponent` uses
(`(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` — 8-30 chars, ≥1 digit, ≥1 lower, ≥1
upper) and the React codebase already standardized on it in `UserCreateForm.tsx:4`. Copying
the constant keeps parity and matches the established React convention. The two-step
regex-then-match ordering mirrors `UserCreateForm.tsx:42-50` exactly.

### Decision: Phone validation rule (no mask library) (ADR-4)

**Choice**: `cellPhone` is a plain `<input type="text">` (mirrors `UserCreateForm.tsx:133`,
which is also a plain text input). Validation on submit:
```ts
const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;
```
This accepts the Angular `ngx-mask` shape `+53 0 000-0000` (prefix `+53 `, mask `0 000-0000`)
with optional separators, e.g. `+53 5 123-4567` or `+5351234567`. On mismatch → set inline
validation error (`RESELLERS.PHONE_FORMAT`), return before service call. The field is also
`required` (HTML).
**Alternatives considered**: (a) add `ngx-mask`-equivalent React mask library
(`react-imask`) — rejected: new dependency, install risk, and `UserCreateForm` proves the
codebase ships plain text phone inputs without masks; (b) no validation at all — rejected:
loses the Angular format contract.
**Rationale**: Locked decision in the proposal: plain input + format validation, no mask
lib. The regex documents and enforces the Cuban `+53` mobile shape the mask encoded, while
keeping the input plain text and dependency-free. The optional-separator form keeps it
forgiving (mask auto-formatted; a plain input must tolerate user spacing).

### Decision: Unsaved-changes guard — use the existing hook (ADR-5)

**Choice**: Both create and edit pages call
`useUnsavedChangesPrompt(isDirty)` from
`~/shared/lib/hooks/use-unsaved-changes-prompt.ts`. `isDirty` is derived from the form
state. The hook internally uses `useBlocker` + `window.confirm` and needs no dialog wiring.
**Alternatives considered**: Wire the presentational
`~/shared/components/unsaved-changes-dialog.tsx` (`UnsavedChangesDialog`) with
save/discard/cancel callbacks.
**Rationale — VERIFIED, corrects a proposal assumption**: I read both files. The hook
`useUnsavedChangesPrompt(isDirty: boolean): void` is fully self-contained — it blocks
navigation when `isDirty && pathname changes` and prompts via `window.confirm`
(`use-unsaved-changes-prompt.ts:4-22`). The `UnsavedChangesDialog` component
(`unsaved-changes-dialog.tsx`) is a SEPARATE, currently-UNUSED presentational alternative
requiring `onSave/onDiscard/onCancel` props. A grep of `app/management` found ZERO usages of
either — so the proposal's "prior management/stores and management/users slices use this" is
inaccurate; no slice wires them today. The HOOK is the correct reusable primitive (zero
props beyond `isDirty`, no dialog state to manage) and gives the Angular
`canDeactivate=pristine` parity directly. We do NOT use `UnsavedChangesDialog` (would require
inventing save/discard/cancel plumbing for no parity gain).

**Dirty derivation**:
- Create: `isDirty = fullName || login || password || confirmPassword || cellPhone || email || description` (any field non-empty → pristine broken), reset before `navigate` on success.
- Edit: snapshot the loaded `ReSeller` into the form on fetch; `isDirty` = any tracked field differs from the snapshot. After a successful PUT, re-snapshot from the submitted values so the page stays "pristine" (edit stays on page — no navigation).

### Decision: HTTP service shape and return types (ADR-6)

**Choice**: `resellerHttpService` singleton object on the shared `apiClient` (pattern from
`feature-http-service.ts` / `user-http-service.ts`), four methods, payload interfaces inline
in the service file (mirrors `user-http-service.ts:4-24`):
```ts
import type { BaseResponseModel, ReSeller } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateResellerPayload {
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  description: string;
}

interface UpdateResellerPayload {
  fullName: string;
  cellPhone: string;
  email: string;
  percentDiscountPrice: number;
  discountPrice: number;
  isActive: boolean;
  description: string;
}

export const resellerHttpService = {
  listResellers(): Promise<BaseResponseModel<ReSeller[]>>,          // GET  /v1/reSellers/all/true
  getReseller(id: string): Promise<BaseResponseModel<ReSeller>>,    // GET  /v1/reSellers/:id
  createReseller(p: CreateResellerPayload): Promise<BaseResponseModel<boolean>>,        // POST /v1/reSellers/
  updateReseller(id: string, p: UpdateResellerPayload): Promise<BaseResponseModel<boolean>>, // PUT /v1/reSellers/:id
};
```
Each method returns `response.data` (the `BaseResponseModel<T>`), exactly like the existing
services.
**Return-type note**: Create/update return `BaseResponseModel<boolean>` (mirrors
`user-http-service.createUser`/`updateUserDetails` which return `BaseResponseModel<boolean>`).
The proposal mentioned `<string>` for create; aligned to `<boolean>` for consistency with the
existing services — the value is not consumed (we read `succeeded`/`errors`), so the type is
not load-bearing.
**Rationale**: `ReSeller` already exists in `@store-mgmt/domain` (verified
`packages/domain/src/models/store.ts:56-66`) with `id, userId, fullName,
percentDiscountPrice, discountPrice, cellPhone, email, description, guest` plus `isActive`
from `AuditableBaseModel`. No new domain type needed. Endpoints mapped 1:1 from Angular
`ReSellerService` (exploration #282). `getReSellerDetailsById` and `deleteReSeller` are
omitted (dead/stub in Angular).

### Decision: Error handling — inline error from `errors[0].description` (ADR-7)

**Choice**: On submit, after the service call resolves, check `res.succeeded`. If false, set
inline error to `res.errors[0]?.description` (Angular parity:
`response.errors[0].description`) falling back to `RESELLERS.ERROR` when `errors` is empty.
On thrown/network error, set inline error to `RESELLERS.ERROR`. List page sets
`RESELLERS.ERROR` on fetch failure (mirrors `admin/stores/routes/store-list.tsx:22-24`).
**Rationale**: Angular create/edit surface `errors[0].description` inline; the React admin
slices surface inline error via `useState` (no toast). `errors` is `BaseError[]`
(non-nullable, `base.ts:18`) so `errors[0]?.description` is safe with the `?.` guard.

## Data Flow

### List (`/admin/resellers`)

    mount → useEffect → loadResellers()
        └─► resellerHttpService.listResellers() ─► apiClient.get('/v1/reSellers/all/true')
                          │  BaseResponseModel<ReSeller[]>
        on success → setResellers(res.data); setError(undefined)
        on throw   → setError(RESELLERS.ERROR)
        render: header + "Add" button (→ /admin/resellers/create);
                card grid; card shows fullName, percentDiscountPrice, discountPrice,
                cellPhone, email (if present), description; `deactive-reSeller` style when
                !isActive; per-card "Edit" → /admin/resellers/edit/:id
        (NO activate/deactivate/delete actions — omitted Angular stubs)

### Create (`/admin/resellers/create`)

    render form (fullName, login, password, confirmPassword, cellPhone, email, description)
    useUnsavedChangesPrompt(isDirty)
    submit → validate PASSWORD_REGEX, then password===confirmPassword, then PHONE_REGEX
        └─► resellerHttpService.createReseller(payload) ─► apiClient.post('/v1/reSellers/', payload)
                          │  BaseResponseModel<boolean>
        succeeded → reset dirty → navigate('/admin/resellers')
        !succeeded → setError(errors[0]?.description ?? RESELLERS.ERROR)
        throw      → setError(RESELLERS.ERROR)

### Edit (`/admin/resellers/edit/:id`)

    mount → useEffect → getReseller(id)
        └─► apiClient.get('/v1/reSellers/:id') ─► BaseResponseModel<ReSeller>
        on success → populate form + snapshot (login read-only/disabled)
    useUnsavedChangesPrompt(isDirty)
    submit → validate PHONE_REGEX
        └─► resellerHttpService.updateReseller(id, payload) ─► apiClient.put('/v1/reSellers/:id', payload)
        succeeded → re-snapshot (stay on page, parity with Angular)
        !succeeded → setError(errors[0]?.description ?? RESELLERS.ERROR)
        throw      → setError(RESELLERS.ERROR)
    fields: login (disabled), fullName, isActive (toggle), percentDiscountPrice (number,
            min=0), discountPrice (number, min=0), cellPhone, email, description

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/admin/resellers/lib/services/reseller-http-service.ts` | Create | `resellerHttpService` singleton: `listResellers`, `getReseller`, `createReseller`, `updateReseller`; inline `CreateResellerPayload` + `UpdateResellerPayload` |
| `apps/web-store-pos/app/admin/resellers/lib/services/__tests__/reseller-http-service.test.ts` | Create | RED-first service tests |
| `apps/web-store-pos/app/admin/resellers/routes/reseller-list.tsx` | Create | `ResellerListPage` (default + named), `loader = superAdminLoader`, inline card grid |
| `apps/web-store-pos/app/admin/resellers/routes/__tests__/reseller-list.test.tsx` | Create | RED-first list tests |
| `apps/web-store-pos/app/admin/resellers/routes/reseller-create.tsx` | Create | `ResellerCreatePage` (default + named), `loader = superAdminLoader`, inline form + validation + unsaved guard |
| `apps/web-store-pos/app/admin/resellers/routes/__tests__/reseller-create.test.tsx` | Create | RED-first create tests |
| `apps/web-store-pos/app/admin/resellers/routes/reseller-edit.tsx` | Create | `ResellerEditPage` (default + named, FLAT), `loader = superAdminLoader`, load-by-id + inline form + unsaved guard |
| `apps/web-store-pos/app/admin/resellers/routes/__tests__/reseller-edit.test.tsx` | Create | RED-first edit tests |
| `apps/web-store-pos/app/routes.ts` | Modify | +3 routes under app-layout, after `admin/dashboard` |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modify | Add `RESELLERS.*` keys (es only) |
| `openspec/specs/admin/spec.md` | Modify (at archive) | Append admin-resellers requirement |

Routes to add (`routes.ts`, after line 67 `admin/dashboard` block):
```ts
// Admin — Resellers
route('admin/resellers', 'admin/resellers/routes/reseller-list.tsx'),
route('admin/resellers/create', 'admin/resellers/routes/reseller-create.tsx'),
route('admin/resellers/edit/:id', 'admin/resellers/routes/reseller-edit.tsx'),
```

## Interfaces / Contracts

```ts
// reseller-http-service.ts — see ADR-6 for full shape
export const resellerHttpService = {
  listResellers(): Promise<BaseResponseModel<ReSeller[]>>,
  getReseller(id: string): Promise<BaseResponseModel<ReSeller>>,
  createReseller(p: CreateResellerPayload): Promise<BaseResponseModel<boolean>>,
  updateReseller(id: string, p: UpdateResellerPayload): Promise<BaseResponseModel<boolean>>,
};

// reseller-create.tsx
const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/; // reused from UserCreateForm
const PHONE_REGEX    = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;              // Cuban +53 mobile shape

// All three pages:
export const loader = superAdminLoader; // from ~/auth/routes/loaders
```

`ReSeller` (reused, `@store-mgmt/domain`):
`{ id, userId, fullName, percentDiscountPrice, discountPrice, cellPhone, email,
description, guest } & { isActive, createdDate, ... } (AuditableBaseModel)`.

Create state: `fullName, login, password, confirmPassword, cellPhone, email, description`
(strings), `error`, `validationError`, `isLoading`.
Edit state: loaded `ReSeller` snapshot + editable `fullName, isActive, percentDiscountPrice,
discountPrice, cellPhone, email, description`, `error`, `validationError`, `isLoading`;
`login` read-only/disabled.

### i18n keys (es.ts, after the admin-dashboard block)

| Key | Suggested value | Source |
|-----|-----------------|--------|
| `RESELLERS.LIST_TITLE` | `'Gestores'` | Angular `MENU.ADMIN.RESELLERS` |
| `RESELLERS.ADD` | `'Adicionar Gestor'` | Angular `RESELLER.ADD_RESELLER` |
| `RESELLERS.CREATE_TITLE` | `'Adicionar Gestor'` | Angular `RESELLER.ADD_RESELLER` |
| `RESELLERS.EDIT_TITLE` | `'Editar Gestor'` | implied |
| `RESELLERS.FULL_NAME` | `'Nombre completo'` | `USER.FULL_NAME` |
| `RESELLERS.LOGIN` | `'Usuario'` | `GENERAL.LOGIN` |
| `RESELLERS.PASSWORD` | `'Contraseña'` | `GENERAL.PASSWORD` |
| `RESELLERS.CONFIRM_PASSWORD` | `'Confirmar contraseña'` | `GENERAL.CONFIRM_PASSWORD` |
| `RESELLERS.CELL_PHONE` | `'Teléfono'` | `GENERAL.CELL_PHONE` |
| `RESELLERS.EMAIL` | `'Correo'` | `GENERAL.EMAIL` |
| `RESELLERS.DESCRIPTION` | `'Descripción'` | `GENERAL.DESCRIPTION` |
| `RESELLERS.PERCENT_DISCOUNT` | `'Porciento de descuento'` | Angular `GENERAL.PERCENT_DISCOUNT_PRICE` |
| `RESELLERS.DISCOUNT_PRICE` | `'Descuento de precio'` | Angular `GENERAL.DISCOUNT_PRICE` |
| `RESELLERS.IS_ACTIVE` | `'Activo'` | implied |
| `RESELLERS.SAVE` | `'Guardar'` | `GENERAL.INSERT` |
| `RESELLERS.PASSWORD_POLICY` | `'La contraseña debe tener 8-30 caracteres, una mayúscula, una minúscula y un dígito'` | Angular `GENERAL.VALIDATION.*` |
| `RESELLERS.PASSWORDS_MUST_MATCH` | `'Las contraseñas no coinciden'` | Angular validation |
| `RESELLERS.PHONE_FORMAT` | `'Formato de teléfono inválido (+53 0 000-0000)'` | new (mask shape) |
| `RESELLERS.ERROR` | `'Ocurrió un error. Intentá de nuevo.'` | generic fallback |

Decision at apply: reuse exact existing `es.ts` strings where keys already exist (proposal
notes most labels reuse `GENERAL.*`/`USER.*`); only add slice-specific keys. Confirm which
`GENERAL.*`/`USER.*` keys already exist when editing `es.ts` and reuse them in `formatMessage`
rather than duplicating values.

## Testing Strategy (STRICT TDD — RED first, runner `pnpm test`)

| File | What to Test | Approach |
|------|--------------|----------|
| `reseller-http-service.test.ts` | singleton exists; `listResellers`→GET `/v1/reSellers/all/true`; `getReseller(id)`→GET `/v1/reSellers/:id`; `createReseller`→POST `/v1/reSellers/` with payload; `updateReseller(id)`→PUT `/v1/reSellers/:id` with payload; each returns `response.data`; each propagates throw | `vi.mock('~/shared/lib/http/api-client')` with `get/post/put/delete: vi.fn()` (pattern from `feature-http-service.test.ts`); mocks use `message:''`, `actionCode:0`, `errors:[]` (NON-nullable) |
| `reseller-list.test.tsx` | exports named `loader` + named/default page; loads via mocked service; renders header + "Add"; renders one card per reseller with fullName/discounts/cellPhone/email/description; `deactive-reSeller` style when `!isActive`; "Add" navigates `/admin/resellers/create`; "Edit" navigates `/admin/resellers/edit/:id`; throw→`RESELLERS.ERROR`; NO activate/deactivate/delete buttons present | mock `superAdminLoader` + `resellerHttpService`; `IntlProvider` + `esMessages`; `fireEvent`+`waitFor` |
| `reseller-create.test.tsx` | renders 7 fields; password failing `PASSWORD_REGEX`→`RESELLERS.PASSWORD_POLICY`, no service call; password≠confirm→`RESELLERS.PASSWORDS_MUST_MATCH`, no service call; bad phone→`RESELLERS.PHONE_FORMAT`, no service call; valid→`createReseller(payload)` then navigate `/admin/resellers`; `!succeeded`→inline `errors[0].description`; throw→`RESELLERS.ERROR`; unsaved guard active when dirty | mock service + `useNavigate`; mock/spy `useUnsavedChangesPrompt` to assert it's called with a truthy `isDirty` after typing; assert `window.confirm` blocking is hook-owned (don't re-test the hook) |
| `reseller-edit.test.tsx` | loads reseller by `:id` via `getReseller`; `login` disabled/read-only; populates fields; `isActive` toggle; number inputs `min=0`; bad phone→`RESELLERS.PHONE_FORMAT`, no PUT; valid→`updateReseller(id, payload)` and STAYS on page (no navigate); `!succeeded`→`errors[0].description`; throw→`RESELLERS.ERROR`; unsaved guard active when a field changes from snapshot | mock service (`getReseller` + `updateReseller`) + `superAdminLoader`; `useParams` id; `IntlProvider`; assert no navigation after success |

Mock-shape gotcha (carried from pattern #262 / dashboard design): `BaseResponseModel<T>`
fields `message/actionCode/errors` are NON-nullable (`base.ts`) — all mocks use `''`/`0`/`[]`,
never `null`. (Note: the older `feature-http-service.test.ts` uses `null`; do NOT copy that —
follow the corrected `''`/`0`/`[]` convention.)

## Risk Resolutions (every proposal risk addressed)

| Proposal Risk | Resolution |
|---------------|------------|
| Phone format parity without mask lib (Med) | ADR-4: plain text input (matches `UserCreateForm`) + `PHONE_REGEX` enforcing the `+53 0 000-0000` shape with optional separators; documented; unit-covered (bad phone blocks submit). No dependency. |
| Password regex + confirm-match (Low) | ADR-3: copy the EXACT `PASSWORD_REGEX` constant + two-step validate from `UserCreateForm.tsx:4,42-50`; unit-cover both the regex-fail and mismatch branches. |
| Slice > 400 lines (~735) (High) | Confirmed in exploration #282. Chained PRs at tasks phase under ask-on-risk. Proposed boundary: PR-1 = service + list + i18n baseline + list route (autonomous, read-only); PR-2 = create + edit + remaining i18n (depends on PR-1 service). Final split decided at tasks. |
| Omitting stub buttons diverges from Angular markup (Low) | Documented in ADR-1 + Data Flow: activate/deactivate/delete are empty Angular stubs; omitting them preserves behavioral parity (clicks were no-ops) and avoids dead-button UX. List-test asserts their absence. |

Additional verified-during-design correction: the proposal stated existing forms wire
`useUnsavedChangesPrompt` + `UnsavedChangesDialog` together. They do NOT (ADR-5) — the hook is
self-contained via `window.confirm`; the dialog is unused. We use ONLY the hook. This is a
simplification, not a risk.

## Migration / Rollout

No migration. Additive new files (8) + 2 small edits (`routes.ts` +3 lines, `es.ts`
RESELLERS.* keys). No shared infra, domain package, menu-config, or `EFeatures` touched.
Local stacked branch only — no push/PR (per `store-mgmt-integration-no-pushpr` rule).
Rollback = revert the slice commit(s).

## Open Questions

- [ ] `RESELLERS.PHONE_FORMAT` regex strictness: the optional-separator form
  (`/^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/`) accepts both `+53 5 123-4567` and `+5351234567`.
  Confirm at apply whether to require the exact spaced/hyphenated mask shape or keep it
  forgiving. Recommendation: keep forgiving (a plain input can't auto-format like the mask did).
- [ ] i18n: confirm at apply which `GENERAL.*`/`USER.*` keys already exist in `es.ts`
  (`GENERAL.CONFIRM_PASSWORD`, `GENERAL.CELL_PHONE`, etc.) and reuse them directly instead of
  adding `RESELLERS.*` duplicates. Add only keys with no existing equivalent.
