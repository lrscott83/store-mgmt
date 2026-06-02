# Tasks: Admin Owners (slice 5/5 — Tab-Shell Edit, 1:1 React Migration)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1190 (680 impl + 420 test + 90 wiring) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR-1 → PR-2 → PR-3 (feature-branch-chain) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (to confirm) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | resellerFeatureLoader + ownerHttpService + OwnerListPage + i18n baseline + 3 routes | PR-1 | Base = feat/phase4-admin-dashboard; ~380 lines; self-contained |
| 2 | OwnerCreatePage (7 fields + reSellerId SA-only + password + unsaved guard + post-create redirect) | PR-2 | Base = PR-1 branch; ~360 lines; depends on service |
| 3 | OwnerEditPage tab-shell (Details + Stores tab + Users placeholder) | PR-3 | Base = PR-2 branch; ~430 lines; depends on service + create |

---

## PR-1 Slice — Loader + Service + List + i18n Baseline + Routes

### Phase 1: i18n Baseline (PR-1 foundation)
- [x] 1.1 Add `OWNER.LIST_TITLE`, `OWNER.EDIT_OWNER`, `OWNER.STORE_PRICE_LABEL`, `OWNER.ERROR` to `app/shared/lib/i18n/es.ts` (req: ADMIN-OWNERS-I18N, S-ADMIN-OWNERS-I18N-1).

### Phase 2: resellerFeatureLoader — RED
- [x] 2.1 Write failing test in `app/auth/routes/__tests__/loaders.test.ts`: `resellerFeatureLoader([EFeatures.Owners])` returns a loader; rejects non-reseller; allows SuperAdmin + Reseller (req: ADMIN-OWNERS-ROUTE, ADMIN-OWNERS-ACCESS, S-ADMIN-OWNERS-ACCESS-1 through 5).
- [x] 2.2 Confirm RED — function does not exist yet.

### Phase 3: resellerFeatureLoader — GREEN
- [x] 3.1 Add `resellerFeatureLoader(featureIds)` to `app/auth/routes/loaders.ts` after existing `adminFeatureLoader`: compose `resellerLoader()` + `featureLoader(featureIds)`. ~10 lines.
- [x] 3.2 `pnpm test --run` — loader tests green; no regressions.

### Phase 4: ownerHttpService — RED
- [x] 4.1 Create `app/admin/owners/lib/services/__tests__/owner-http-service.test.ts`. Failing tests: 5 methods (listOwners/getOwner/createOwner/updateOwner/deleteOwner), correct URLs, non-nullable mocks (`message:''`, `actionCode:0`, `errors:[]`). `vi.mock` apiClient (req: ADMIN-OWNERS-HTTP, S-ADMIN-OWNERS-HTTP-1 through 6).
- [x] 4.2 Confirm RED.

### Phase 5: ownerHttpService — GREEN
- [x] 5.1 Create `app/admin/owners/lib/services/owner-http-service.ts`. Singleton on `apiClient`. Inline `CreateOwnerPayload` / `UpdateOwnerPayload`. Methods return `response.data`. No `getOwnerDetailsById`/approve/activate/deactivate (non-goals ADMIN-OWNERS-NGOAL-1 through 4).
- [x] 5.2 `pnpm test --run` — service tests green; no regressions.

### Phase 6: OwnerListPage — RED
- [x] 6.1 Create `app/admin/owners/routes/__tests__/owner-list.test.tsx`. Tests: cards show fullName/price/count/reSellerName-fallback/cellPhone/email/description; `deactive-owner` when `isActive=false`; `guest-owner` when `isActive=true && approved=false`; empty `storeModules` → price=0/count=0; delete calls `deleteOwner`+reload, NO confirm; no create button; error inline (req: ADMIN-OWNERS-LIST, S-ADMIN-OWNERS-LIST-1 through 10). Wrap `IntlProvider`.
- [x] 6.2 Confirm RED.

### Phase 7: OwnerListPage — GREEN
- [x] 7.1 Create `app/admin/owners/routes/owner-list.tsx`. `useState+useEffect` → `listOwners()`. Card grid: price via `storeModules.reduce(+storeModuleTotalCurrentPrice,0)` formatted via `intl.formatNumber`; count via `OWNER.STORE_PRICE_LABEL {count}`; `reSellerName` fallback `'ADMIN'`; CSS guard; edit nav; delete button → `deleteOwner(id)` then reload. No create button. Inline error.
- [x] 7.2 `pnpm test --run` — list tests green; no regressions.

### Phase 8: Route Registration + PR-1 Verification
- [x] 8.1 Add 3 routes in `app/routes.ts` after `admin/resellers/edit/:id`: `admin/owners` (OwnerListPage), `admin/owners/create` (OwnerCreatePage), `admin/owners/edit/:id` (OwnerEditPage). Loader = `resellerFeatureLoader([EFeatures.Owners])` (req: ADMIN-OWNERS-ROUTE, S-ADMIN-OWNERS-ROUTE-1 through 3).
- [x] 8.2 `pnpm test --run && tsc --noEmit` — clean; 3 routes reachable.

---

## PR-2 Slice — OwnerCreatePage

### Phase 9: i18n Create Keys
- [x] 9.1 Add `OWNER.CREATE_TITLE`, `OWNER.PASSWORD_POLICY`, `OWNER.PASSWORDS_MUST_MATCH`, `OWNER.PHONE_FORMAT` to `app/shared/lib/i18n/es.ts` (req: ADMIN-OWNERS-I18N, S-ADMIN-OWNERS-I18N-2).

### Phase 10: OwnerCreatePage — RED
- [x] 10.1 Create `app/admin/owners/routes/__tests__/owner-create.test.tsx`. Tests: 7 fields; PASSWORD_REGEX fail → `OWNER.PASSWORD_POLICY`, no call; mismatch → `OWNER.PASSWORDS_MUST_MATCH`; bad phone → `OWNER.PHONE_FORMAT`; reSellerId select present for SuperAdmin, absent for Reseller; valid → `createOwner` + navigate `/management/stores/create`; `!succeeded` → `errors[0].description`; throw → `OWNER.ERROR`; `useUnsavedChangesPrompt` called when dirty, not on pristine (req: ADMIN-OWNERS-CREATE, S-ADMIN-OWNERS-CREATE-1 through 10). Wrap `IntlProvider`; mock `auth-store({user:{isSuperAdmin}})` + `reseller-http-service`.
- [x] 10.2 Confirm RED.

### Phase 11: OwnerCreatePage — GREEN
- [x] 11.1 Create `app/admin/owners/routes/owner-create.tsx`. PASSWORD_REGEX exact copy from `UserCreateForm.tsx:4`. `PHONE_REGEX=/^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/` (ADR-4). 7 fields + reSellerId select (SuperAdmin-only, from `resellerHttpService.listResellers()`). Two-step password validate. Submit disabled when invalid or pristine. On success navigate `/management/stores/create`. Inline error. `useUnsavedChangesPrompt(isDirty)` on dirty fields (ADR-5).
- [x] 11.2 `pnpm test --run` — create tests green; no regressions.

### Phase 12: PR-2 Verification
- [x] 12.1 `pnpm test --run && tsc --noEmit` — clean. Route `admin/owners/create` wired to `OwnerCreatePage`.

---

## PR-3 Slice — OwnerEditPage (Tab-Shell)

### Phase 13: i18n Edit Keys
- [x] 13.1 Add `OWNER.EDIT_TITLE`, `OWNER.USERS_TAB_PLACEHOLDER` + verify `GENERAL.DETAILS`, `GENERAL.STORES`, `GENERAL.USERS` exist in `app/shared/lib/i18n/es.ts` (req: ADMIN-OWNERS-I18N, ADMIN-OWNERS-EDIT-TABS, S-ADMIN-OWNERS-I18N-1).

### Phase 14: OwnerEditPage — RED
- [x] 14.1 Create `app/admin/owners/routes/__tests__/owner-edit.test.tsx`. Tests: loads by `:id` → `getOwner(id)` + pre-populates; `login` field disabled + NOT in PUT body; `isActive` toggle shown for SuperAdmin, hidden for Reseller; `reSellerId` select shown for SuperAdmin only; 3 tabs rendered for SuperAdmin (Details/Stores/Users), Details-only for Reseller; Stores tab mounts `StoreListPage` (mock `management/stores/routes/store-list` default); Users tab renders placeholder paragraph; bad phone blocks PUT; valid PUT → stays on same page; `!succeeded` → `errors[0].description`; throw → `OWNER.ERROR`; `guest` carried from loaded value, not shown; `useUnsavedChangesPrompt` active (req: ADMIN-OWNERS-EDIT-DETAILS, ADMIN-OWNERS-EDIT-TABS, S-ADMIN-OWNERS-EDIT-DETAILS-1 through 8, S-ADMIN-OWNERS-EDIT-TABS-1 through 4).
- [x] 14.2 Confirm RED.

### Phase 15: OwnerEditPage — GREEN
- [x] 15.1 Create `app/admin/owners/routes/owner-edit.tsx`. `useState<'details'|'stores'|'users'>` tab state + button-tab chrome (SuperAdmin-only, ADR-9). On mount: `getOwner(id)` → snapshot. Fields: `login` disabled not in payload; `fullName`; `cellPhone` + PHONE_REGEX; `email`; `description`; `isActive` toggle (SuperAdmin-only, ADR-7); `reSellerId` select (SuperAdmin-only, from `listResellers()`). `guest` read from state, included in PUT payload, NOT rendered (ADR-8). Stores tab: `<StoreListPage />` (SuperAdmin-only). Users tab: `<p>{intl.formatMessage({id:'OWNER.USERS_TAB_PLACEHOLDER'})}</p>`. On PUT success: re-snapshot + stay. Inline error. `useUnsavedChangesPrompt(isDirty)` (ADR-5).
- [x] 15.2 `pnpm test --run` — edit tests green; no regressions.

### Phase 16: PR-3 Verification + Full Suite
- [x] 16.1 Wire `admin/owners/edit/:id` route in `app/routes.ts` to `OwnerEditPage` (done in Phase 8.1).
- [x] 16.2 `pnpm test --run && tsc --noEmit` — 740 tests (baseline 672 + 68 new), 69 files, all green; typecheck clean.

---

## Files

### PR-1 (8 files) ✓
- CREATE `app/admin/owners/lib/services/owner-http-service.ts`
- CREATE `app/admin/owners/lib/services/__tests__/owner-http-service.test.ts`
- CREATE `app/admin/owners/routes/owner-list.tsx`
- CREATE `app/admin/owners/routes/__tests__/owner-list.test.tsx`
- MODIFY `app/auth/routes/loaders.ts` (+resellerFeatureLoader ~10 lines)
- MODIFY `app/auth/routes/__tests__/loaders.test.ts` (+loader guard tests)
- MODIFY `app/shared/lib/i18n/es.ts` (OWNER baseline keys)
- MODIFY `app/routes.ts` (+3 routes)

### PR-2 (3 files) ✓
- CREATE `app/admin/owners/routes/owner-create.tsx`
- CREATE `app/admin/owners/routes/__tests__/owner-create.test.tsx`
- MODIFY `app/shared/lib/i18n/es.ts` (OWNER create keys — additive)

### PR-3 (3 files) ✓
- CREATE `app/admin/owners/routes/owner-edit.tsx`
- CREATE `app/admin/owners/routes/__tests__/owner-edit.test.tsx`
- MODIFY `app/shared/lib/i18n/es.ts` (OWNER edit keys + GENERAL.* added)
