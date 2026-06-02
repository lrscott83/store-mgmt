# Tasks: Admin Resellers (SuperAdmin Reseller CRUD)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–780 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR-1 (service + list + i18n baseline + routes) → PR-2 (create + edit + remaining i18n + routes) |
| Delivery strategy | ask-on-risk |
| Chain strategy | to confirm |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: to confirm
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | HTTP service + ResellerListPage + i18n baseline + list route | PR-1 | Base = `feat/phase4-admin-dashboard`; self-contained, shippable |
| 2 | ResellerCreatePage + ResellerEditPage + remaining i18n + create/edit routes | PR-2 | Base = PR-1 branch; depends on service from PR-1 |

---

## PR-1 Slice — Service + List + i18n Baseline + List Route

### Phase 1: i18n Baseline (PR-1 foundation)

- [x] 1.1 Add `RESELLERS.LIST_TITLE`, `RESELLERS.ADD`, `RESELLERS.ERROR` to `app/shared/lib/i18n/es.ts` under a new `RESELLERS` key group. No `en.ts` changes (req: ADMIN-RESELLERS-I18N, S-ADMIN-RESELLERS-I18N-1).

### Phase 2: HTTP Service — RED

- [x] 2.1 Create `app/admin/resellers/lib/services/__tests__/reseller-http-service.test.ts`. Write failing tests: `listResellers()` calls `GET /v1/reSellers/all/true`; `getReseller(42)` calls `GET /v1/reSellers/42`; `createReseller(payload)` calls `POST /v1/reSellers/`; `updateReseller(42, payload)` calls `PUT /v1/reSellers/42`. Mock `~/lib/api-client` via `vi.mock` (get/post/put: `vi.fn`). All mock responses use `{ data: { message: '', actionCode: 0, errors: [], data: ... } }` — non-nullable fields (S-ADMIN-RESELLERS-HTTP-1 through 4).
- [x] 2.2 Confirm new tests fail (RED) — service file does not yet exist.

### Phase 3: HTTP Service — GREEN

- [x] 3.1 Create `app/admin/resellers/lib/services/reseller-http-service.ts`. Singleton on shared `apiClient`. Inline `CreateResellerPayload` and `UpdateResellerPayload` interfaces. Implement four methods returning `response.data`. Types: `BaseResponseModel<ReSeller[]>`, `BaseResponseModel<ReSeller>`, `BaseResponseModel<boolean>` (×2). No delete/approve/getDetails methods (ADMIN-RESELLERS-NGOAL-7, -8).
- [x] 3.2 Run `pnpm test` — service tests green; no regressions (S-ADMIN-RESELLERS-HTTP-5).

### Phase 4: ResellerListPage — RED

- [x] 4.1 Create `app/admin/resellers/routes/__tests__/reseller-list.test.tsx`. Failing tests: file exports named `loader` equal to `superAdminLoader` and a default component; renders one card per reseller with `fullName`, `percentDiscountPrice`, `discountPrice`, `cellPhone`, non-empty `email`, `description`; card with `isActive=false` has `deactive-reSeller` class; Add button navigates to `/admin/resellers/create`; Edit control navigates to `/admin/resellers/edit/:id`; HTTP throw renders `RESELLERS.ERROR`; no activate/deactivate/delete buttons in DOM. Wrap in `IntlProvider`. Mock `resellerHttpService` and `react-router` (S-ADMIN-RESELLERS-LIST-1 through 7).
- [x] 4.2 Confirm tests fail (RED).

### Phase 5: ResellerListPage — GREEN

- [x] 5.1 Create `app/admin/resellers/routes/reseller-list.tsx`. `export const loader = superAdminLoader`. `useState` for resellers + error. `useEffect` → `listResellers()` → `setResellers` / catch → `setError`. Render header with Add button (`/admin/resellers/create`). Map resellers: apply `deactive-reSeller` when `!isActive`; show fields per spec; Edit control per card (`/admin/resellers/edit/:id`). Inline error display. No activate/deactivate/delete buttons (ADMIN-RESELLERS-LIST; ADMIN-RESELLERS-NGOAL-1).
- [x] 5.2 Run `pnpm test` — list tests green; no regressions.

### Phase 6: List Route Registration + PR-1 Verification

- [x] 6.1 Add `route('admin/resellers', 'admin/resellers/routes/reseller-list.tsx')` in `app/routes.ts` after `admin/dashboard` (req: ADMIN-RESELLERS-ROUTE, S-ADMIN-RESELLERS-ROUTE-1).
- [x] 6.2 Run `pnpm test` + `tsc --noEmit` — clean. Verify list route resolves with superAdmin session (S-ADMIN-RESELLERS-ACCESS-1).

---

## PR-2 Slice — Create + Edit + Remaining i18n + Create/Edit Routes

### Phase 7: i18n Remaining Keys (PR-2 foundation)

- [x] 7.1 Add `RESELLERS.CREATE_TITLE`, `RESELLERS.EDIT_TITLE`, `RESELLERS.PERCENT_DISCOUNT`, `RESELLERS.DISCOUNT_PRICE`, `RESELLERS.PASSWORD_POLICY`, `RESELLERS.PASSWORDS_MUST_MATCH`, `RESELLERS.PHONE_FORMAT` to `app/shared/lib/i18n/es.ts` (req: ADMIN-RESELLERS-I18N, S-ADMIN-RESELLERS-I18N-2). Reuse existing `GENERAL.*`/`USER.*` keys for shared labels — do not duplicate.

### Phase 8: ResellerCreatePage — RED

- [x] 8.1 Create `app/admin/resellers/routes/__tests__/reseller-create.test.tsx`. Failing tests: 7 fields rendered; `PASSWORD_REGEX` fail → shows `RESELLERS.PASSWORD_POLICY`, no `createReseller` call; password/confirm mismatch → shows `RESELLERS.PASSWORDS_MUST_MATCH`, no call; bad phone → shows `RESELLERS.PHONE_FORMAT`, no call; valid submit → calls `createReseller(payload)` then navigates `/admin/resellers`; `!succeeded` → shows `errors[0].description`; throw → shows `RESELLERS.ERROR`; `useUnsavedChangesPrompt` called with truthy `isDirty` when fields non-empty. Wrap in `IntlProvider`. Mock service + router + hook (S-ADMIN-RESELLERS-CREATE-1 through 9).
- [x] 8.2 Confirm tests fail (RED).

### Phase 9: ResellerCreatePage — GREEN

- [x] 9.1 Create `app/admin/resellers/routes/reseller-create.tsx`. `export const loader = superAdminLoader`. `const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/` (copied exactly from `UserCreateForm.tsx`). `const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/`. Fields: `fullName`, `login`, `password`, `confirmPassword`, `cellPhone`, `email`, `description`. Two-step password validate (regex → then cross-match). Submit disabled when invalid. On success → navigate `/admin/resellers`. On `!succeeded` → `errors[0]?.description ?? RESELLERS.ERROR`. On throw → `RESELLERS.ERROR`. Wire `useUnsavedChangesPrompt(isDirty)` — dirty = any field non-empty. No `UnsavedChangesDialog` wiring (ADR-5).
- [x] 9.2 Run `pnpm test` — create tests green; no regressions.

### Phase 10: ResellerEditPage — RED

- [x] 10.1 Create `app/admin/resellers/routes/__tests__/reseller-edit.test.tsx`. Failing tests: loads reseller by `:id` via `getReseller`; pre-populates fields; `login` field is disabled/read-only and absent from PUT body; `isActive` toggle reflected in payload; `percentDiscountPrice`/`discountPrice` have `min=0`; bad phone blocks `updateReseller`; valid submit → calls `updateReseller(id, payload)` and STAYS on page (`/admin/resellers/edit/:id`); `!succeeded` → `errors[0].description`; throw → `RESELLERS.ERROR`; `useUnsavedChangesPrompt` called with truthy `isDirty` when snapshot differs. Wrap in `IntlProvider`. Mock service + router + hook (S-ADMIN-RESELLERS-EDIT-1 through 8).
- [x] 10.2 Confirm tests fail (RED).

### Phase 11: ResellerEditPage — GREEN

- [x] 11.1 Create `app/admin/resellers/routes/reseller-edit.tsx`. `export const loader = superAdminLoader`. On mount: read `:id` from params → `getReseller(id)` → populate state snapshot. Fields: `login` (disabled, excluded from `UpdatePayload`), `fullName`, `isActive` (toggle), `percentDiscountPrice` (min=0), `discountPrice` (min=0), `cellPhone` (+ `PHONE_REGEX`), `email`, `description`. On success → re-snapshot + stay on page. On `!succeeded`/throw → inline error. Wire `useUnsavedChangesPrompt(isDirty)` — dirty = any tracked field differs from snapshot. No `reSellerId` control (ADMIN-RESELLERS-NGOAL-4). Flat page, no shell/tabs (ADMIN-RESELLERS-NGOAL-3).
- [x] 11.2 Run `pnpm test` — edit tests green; no regressions.

### Phase 12: Create/Edit Route Registration + Access Guard Tests

- [x] 12.1 Add `route('admin/resellers/create', 'admin/resellers/routes/reseller-create.tsx')` and `route('admin/resellers/edit/:id', 'admin/resellers/routes/reseller-edit.tsx')` in `app/routes.ts` (req: ADMIN-RESELLERS-ROUTE, S-ADMIN-RESELLERS-ROUTE-2, -3).
- [x] 12.2 Write/extend `__tests__` for `superAdminLoader` guard: SuperAdmin reaches list (S-ADMIN-RESELLERS-ACCESS-1); OwnerAdmin blocked on list/create/edit (S-ADMIN-RESELLERS-ACCESS-2, -4, -5); unauthenticated redirected to `/login` (S-ADMIN-RESELLERS-ACCESS-3). Confirm green.
- [x] 12.3 Run `pnpm test` + `tsc --noEmit` — clean. Verify create and edit routes resolve with superAdmin session.

---

## Files

### PR-1
- CREATE `app/admin/resellers/lib/services/reseller-http-service.ts`
- CREATE `app/admin/resellers/lib/services/__tests__/reseller-http-service.test.ts`
- CREATE `app/admin/resellers/routes/reseller-list.tsx`
- CREATE `app/admin/resellers/routes/__tests__/reseller-list.test.tsx`
- MODIFY `app/shared/lib/i18n/es.ts` (RESELLERS group, partial keys)
- MODIFY `app/routes.ts` (list route)

### PR-2
- CREATE `app/admin/resellers/routes/reseller-create.tsx`
- CREATE `app/admin/resellers/routes/__tests__/reseller-create.test.tsx`
- CREATE `app/admin/resellers/routes/reseller-edit.tsx`
- CREATE `app/admin/resellers/routes/__tests__/reseller-edit.test.tsx`
- MODIFY `app/shared/lib/i18n/es.ts` (remaining RESELLERS keys)
- MODIFY `app/routes.ts` (create + edit routes)
