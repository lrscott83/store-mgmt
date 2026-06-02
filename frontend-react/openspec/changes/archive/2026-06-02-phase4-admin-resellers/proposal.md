# Proposal: Admin Resellers (SuperAdmin Reseller CRUD) — 1:1 React Migration

## Intent

Migrate the Angular `presentation/resellers/` routes (list, create, edit) to React 19 at `apps/web-store-pos/app/admin/resellers/`, SuperAdmin-gated, at 100% behavioral parity. Angular components are the single source of truth. This is slice 4/5 of the admin group (after features, stores, dashboard). Purely additive CRUD pages — `ReSeller` model, `EFeatures.ReSellers`, and menu config already exist.

## Scope

### In Scope
- `resellerHttpService` singleton on shared `apiClient`: `listResellers()` (GET `/v1/reSellers/all/true`), `getReseller(id)` (GET `/v1/reSellers/:id`), `createReseller(payload)` (POST `/v1/reSellers/`), `updateReseller(id, payload)` (PUT `/v1/reSellers/:id`).
- `ResellerListPage`: card grid of resellers, `deactive-reSeller` styling on `!isActive`, navigate-to-create + navigate-to-edit. `loader = superAdminLoader`.
- `ResellerCreatePage`: form (fullName, login, password+confirm with regex+match validation, cellPhone, email, description). POST then navigate to list. Inline error from `response.errors[0].description`.
- `ResellerEditPage`: flat route (Approach A — no shell/tab split). Loads by `:id`, patches form (login disabled/read-only, fullName, isActive toggle, percentDiscountPrice, discountPrice, cellPhone, email, description). PUT then stay on page.
- Unsaved-changes guard on BOTH forms via existing `useUnsavedChangesPrompt` + `UnsavedChangesDialog` (parity with Angular `canDeactivate` = pristine).
- `RESELLERS.*` i18n keys in `es.ts` (reuse existing `GENERAL.*`/`USER.*` field labels).
- 3 route registrations in `app/routes.ts` under app-layout.
- Co-located service + route tests (vitest).

### Out of Scope (explicit non-goals)
- Activate / Deactivate / Delete actions on the list — Angular methods are empty no-op stubs; rendering dead buttons is worse UX. OMITTED entirely.
- `approveReSeller()` stub (never wired in Angular template).
- Phone-mask library (e.g. react-input-mask) — plain text input with format validation only.
- Shell/tab-group edit wrapper, `reSellerId` dead control, `getReSellerDetailsById` endpoint (all unused dead code in Angular).
- Any change to `ReSeller` domain model, `EFeatures`, `menu-config.ts`, or `MENU.RESELLERS` (all already present).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `admin`: add admin-resellers requirement (SuperAdmin-gated reseller list + create + edit; flat edit route; activate/deactivate/delete omitted as Angular-stub no-ops) to canonical `openspec/specs/admin/spec.md` at archive.

## Approach

Mirror the established admin slice pattern: flat container per route, `useState` + `useEffect` + `useIntl`, no Context/Redux, inline success/error state, no toast. Edit route flattened to a single `ResellerEditPage` (Approach A) — 1:1 = behavioral parity, not file-count parity. Password/confirm validation reuses the existing UserCreate validation pattern. `BaseResponseModel<T>` fields (message/actionCode/errors) are non-nullable — test mocks use `''`/`0`/`[]`, never `null`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/admin/resellers/lib/services/reseller-http-service.ts` | New | 4 CRUD methods on shared `apiClient` |
| `app/admin/resellers/routes/reseller-list.tsx` | New | Card grid; `loader = superAdminLoader`; navigate create/edit |
| `app/admin/resellers/routes/reseller-create.tsx` | New | Create form + unsaved guard |
| `app/admin/resellers/routes/reseller-edit.tsx` | New | Flat edit form (load by id) + unsaved guard |
| `app/admin/resellers/**/__tests__/*` | New | Service + 3 route test files |
| `app/routes.ts` | Modified | +3 route registrations under app-layout |
| `app/shared/lib/i18n/es.ts` | Modified | `RESELLERS.*` slice keys (reuse existing field labels) |
| `openspec/specs/admin/spec.md` | Modified (archive) | Append admin-resellers requirement |
| `ReSeller` model, `EFeatures`, `menu-config.ts` | Reuse (no change) | Already in place |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Phone format parity without mask library | Med | Plain text input + format validation; document accepted shape in spec/design |
| Password regex + confirm-match correctness | Low | Reuse existing UserCreate validation pattern; unit-cover mismatch case |
| Slice exceeds 400-line review budget (~735 lines) | High | Chained PRs — final boundary set at tasks phase under ask-on-risk |
| Omitting stub actions diverges from Angular markup | Low | Documented decision; Angular buttons are no-ops — behavioral parity preserved |

## Delivery Note

Chained PRs expected (>400 lines). Proposed split: PR-1 = `resellerHttpService` + `ResellerListPage` + i18n baseline + list route (read-only, autonomous); PR-2 = create + edit routes + remaining i18n (depends on PR-1 service). Final boundary is decided at the tasks phase under `ask-on-risk` — not over-specified here.

## Rollback Plan

Revert the slice commit(s) on the local branch. All changes are additive new files plus 2 small edits (`routes.ts`, `es.ts`); no shared infra touched. No push/PR — local stacked branch only.

## Dependencies

- Existing `superAdminLoader`, `apiClient`, `useUnsavedChangesPrompt` + `UnsavedChangesDialog`, `ReSeller` domain model, `EFeatures.ReSellers`, menu config. No new external dependency.

## Success Criteria

- [ ] Three routes gated by `superAdminLoader`; list renders reseller cards, create/edit forms behave 1:1 with Angular.
- [ ] HTTP service wired to all 4 endpoints; create navigates to list, edit stays on page.
- [ ] Unsaved-changes guard active on both forms.
- [ ] No activate/deactivate/delete buttons, no mask library, no dead code (shell/reSellerId/details endpoint).
- [ ] Tests pass; chained PRs each kept within review budget.
