# Proposal: Migrate Angular admin/features → React (1:1 parity)

## Intent

The React POS app has no `admin/` routes. The menu already links `/admin/features` but it 404s. Angular exposes a SuperAdmin-only "Features" page with a single button that activates features via `POST /v1/features/activate`. This slice ports that page 1:1 and establishes the `admin/` route prefix + a strict SuperAdmin guard reused by later admin slices.

## Scope

### In Scope
- `admin/features` container route mirroring `management/users` / `management/configurations` structure.
- `feature-http-service.activateFeatures()` → `POST /v1/features/activate`, empty body, returns `BaseResponseModel<boolean>`.
- New `superAdminLoader` (strict `isSuperAdmin` only) in `auth/routes/loaders.ts`.
- Register `admin/features` route under existing `app-layout` in `routes.ts`.
- `FEATURES.*` i18n keys in `es.ts` (and `en.ts` if present).
- Route + service tests.

### Out of Scope
- Backend work — `POST /v1/features/activate` confirmed to exist.
- Toast UI — use inline success/error state per React convention (Angular used toastr).
- Loading/disabled button state — Angular has none.
- Separate `admin/` layout — Angular had none.
- `menu-config.ts` — entry already present.
- Broadening/reusing `adminLoader` (`isSuperAdmin || isOwnerAdmin`).

## Capabilities

### New Capabilities
- `admin-features`: SuperAdmin-gated page to activate features, plus the strict-SuperAdmin loader and `admin/` route prefix it establishes.

### Modified Capabilities
- None.

## Approach

Mirror the existing `management/*` structural template: container route + `lib/services` http-service calling `apiClient`, with `__tests__`. Add a `superAdminLoader` to `loaders.ts` gating on `isSuperAdmin` ONLY (strict Angular parity, distinct from broadened `adminLoader`); reused by future SuperAdmin admin slices. Page renders title + single activate button; on click calls the service and sets inline success/error state from `FEATURES.*` keys.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/admin/features/routes/features.tsx` | New | Container page |
| `apps/web-store-pos/app/admin/features/lib/services/feature-http-service.ts` | New | `activateFeatures()` |
| `apps/web-store-pos/app/admin/features/routes/__tests__/` | New | Route + service tests |
| `apps/web-store-pos/app/routes.ts` | Modified | Register `admin/features` |
| `apps/web-store-pos/app/auth/routes/loaders.ts` | Modified | Add `superAdminLoader` |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modified | `FEATURES.*` keys |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `superAdminLoader` diverges from `adminLoader` behavior | Low | Strict parity is the locked decision; document the difference |
| `GENERAL.RESPONSE.*` keys missing in React i18n | Med | Verify during spec/apply; add if absent |
| `en.ts` may not exist | Low | Add keys only if file present |

## Rollback Plan

Revert the route registration in `routes.ts` (re-introduces 404, matching prior state) and delete the new `admin/features/` directory, `superAdminLoader`, and `FEATURES.*` keys. No backend or schema changes to undo.

## Dependencies

- Backend `POST /v1/features/activate` (exists).
- `EFeatures.Features = 14`, `UserModel.isSuperAdmin` (exist in domain).

## Success Criteria

- [ ] `/admin/features` renders for SuperAdmin; blocked for non-SuperAdmin.
- [ ] Activate button calls `POST /v1/features/activate` and shows inline success/error.
- [ ] Behavior matches Angular `FeaturesComponent` 1:1.
- [ ] Route + service tests pass.
