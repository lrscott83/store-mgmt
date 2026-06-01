# Proposal: Admin Stores (super-admin store list)

## Intent

Migrate the Angular `admin/stores` route (super-admin store list, gated by `SuperAdminAuthGuard`) to React 19 at strict 1:1 parity. Slice 2/5 of the admin group. A super-admin needs to see ALL stores and approve/disapprove/edit/create them. Maximize reuse: the React `management/stores` slice already migrated the store service and a pure presentational `StoreList`; this change only adds a thin admin container + route, with one backward-compatible prop relaxation.

## Scope

### In Scope
- New container `AdminStoreListPage` at `app/admin/stores/routes/store-list.tsx` (template = admin/features slice).
- Register route `admin/stores` in `app/routes.ts`.
- Reuse `storeHttpService.listStores()` (GET `/v1/stores/by-current-user`; backend scopes by role) — no new service.
- Reuse `<StoreList>` presentational from `management/stores/components/store-list.tsx`.
- Guard `loader = superAdminLoader` (isSuperAdmin ONLY; no EFeatures check — matches Angular SuperAdminAuthGuard).
- Wire actions 1:1: onCreate → `/management/stores/create`; onEdit → `/management/stores/edit/:id`; onApprove, onDisapprove.
- Make `onActivate`/`onDeactivate` OPTIONAL in `StoreListProps` (backward-compatible; management/stores keeps passing them).
- Container omits onActivate/onDeactivate (Angular comments them out → not wired).
- Unit tests `app/admin/stores/routes/__tests__/store-list.test.tsx`.

### Out of Scope
- Offline/degraded cache (Angular StoreListComponent has none → admin/stores stays 1:1, no BaseRepository).
- Activate/Deactivate behavior (commented out in Angular).
- Any change to `storeHttpService`, `Store` model, or management/stores container.

## Capabilities

### New Capabilities
- None (extends existing `admin` capability spec).

### Modified Capabilities
- `admin`: add `admin/stores` route requirement — super-admin store list rendering shared StoreList, reusing storeHttpService, gated by superAdminLoader, wiring create/edit/approve/disapprove only.
- `management`: relax `StoreListProps` so `onActivate`/`onDeactivate` are optional (no behavior change for management/stores; enables admin reuse without no-ops).

## Approach

Mirror the `admin/features` slice structure. Container loads stores via `storeHttpService.listStores()` in `useEffect` (no cache, no online gating), stores in local state, renders shared `<StoreList>`. Pass `isOnline`/`isDegraded` as static (online=true, degraded=false) and `error` from a failed fetch. Wire only create/edit/approve/disapprove; leave onActivate/onDeactivate undefined. Relax the props interface to make those two optional so the presentational stops requiring them while management/stores still compiles unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/admin/stores/routes/store-list.tsx` | New | AdminStoreListPage container + superAdminLoader |
| `app/admin/stores/routes/__tests__/store-list.test.tsx` | New | Unit tests for container |
| `app/routes.ts` | Modified | Register `admin/stores` route |
| `app/management/stores/components/store-list.tsx` | Modified | onActivate/onDeactivate optional in props |
| `app/shared/lib/i18n/es.ts` | Modified (maybe) | Add ADMIN_STORES title only if distinct from STORES.LIST_TITLE |
| `storeHttpService`, `Store` model | Reuse (no change) | Imported as-is |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `/v1/stores/by-current-user` not returning all stores for super-admin | Low | Backend behavior verified in exploration; assert in test via service mock |
| Relaxing props breaks management/stores typing | Low | Optional widening is backward-compatible; type-check + management tests |
| StoreList renders activate/deactivate UI when handlers undefined | Med | Guard rendering on handler presence inside presentational |

## Rollback Plan

Revert the three new/modified files: delete `app/admin/stores/`, remove the `admin/stores` route line from `app/routes.ts`, and restore `onActivate`/`onDeactivate` to required in `store-list.tsx`. No data migrations, no service changes — fully reversible by `git revert` of the single commit.

## Dependencies

- `superAdminLoader` (added in admin-features slice) — already present.
- `storeHttpService` and `<StoreList>` from management/stores — already present.

## Success Criteria

- [ ] `admin/stores` resolves only for isSuperAdmin; others rejected by loader.
- [ ] Page lists stores from `listStores()` and renders shared StoreList.
- [ ] Create/edit navigate to management routes; approve/disapprove call the service; activate/deactivate are NOT wired.
- [ ] No offline cache present.
- [ ] management/stores still compiles and its tests pass after props relaxation.
