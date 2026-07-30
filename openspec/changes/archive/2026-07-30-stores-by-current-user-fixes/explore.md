# Exploration: stores-by-current-user-fixes

**Change**: `stores-by-current-user-fixes`
**Phase**: explore
**Date**: 2026-07-30
**Artifact store**: hybrid (this file + engram `sdd/stores-by-current-user-fixes/explore`)
**Goal**: Fix 6 bugs found in api-endpoint-review of `GET /api/v1/stores/by-current-user`

## Confirmed Bugs

### BUG-1 (HIGH) — Non-superadmins see ALL stores in tenant, no user filter
- **File**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs:33`
- **What**: Handler calls `GetStoresAsync(true)` for non-superadmins, which returns ALL stores in the tenant with no user-specific filtering. `GetActiveStoresByUserIdAsync()` exists in the repository but isn't used.
- **Fix**: Switch to `GetActiveStoresByUserIdAsync(CurrentUserId)` for non-superadmins.

### BUG-2 (HIGH) — OwnerName NRE on both code paths
- **File**: `backend/src/Application/Mappings/StoreManagement/StoreProfile.cs:20`
- **What**: Mapping `src.Owner.User.FullName` requires `.Include(s => s.Owner).ThenInclude(o => o.User)`. Neither repo method includes `.ThenInclude(o => o.User)`. Non-superadmin path doesn't even `.Include(s => s.Owner)`. Lazy loading proxies NOT configured → NRE at runtime when the response is serialized.
- **Fix**: Add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both repo methods.

### BUG-3 (MEDIUM) — DefaultStore filter runs client-side after materialization
- **File**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs:35`
- **What**: `stores.Where(s => s.Id != DataUtils.DefaultStore.Id)` runs on `IEnumerable<Store>` (already in memory) instead of being pushed to the database query.
- **Fix**: Add `.Where(s => s.Id != defaultStoreId)` in the repository methods before `.ToListAsync()`.

### BUG-4 (MEDIUM) — Hardcoded `true` parameter is misleading
- **File**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs:34`
- **What**: `GetStoresAsync(true)` with `includeInactive=true` means the WHERE clause becomes `WHERE (true OR s.IsActive)` which is always true. This returns ALL stores including inactive ones for non-superadmins.
- **Fix**: Pass `includeInactive: false` or change the method signature to clarify intent. After fixing BUG-3, non-superadmins should only see active stores anyway.

### BUG-5 (LOW) — Missing `[ProducesResponseType(401)]` and `[ProducesResponseType(403)]`
- **File**: `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs:41`
- **What**: Only 200 OK is documented. The filter returns 401 (unauthorized) and 403 (forbidden) but Swagger doesn't reflect this.
- **Fix**: Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

### BUG-6 (LOW) — Missing XML `<summary>` comment
- **File**: `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs:40`
- **What**: No XML doc comment on the endpoint method.
- **Fix**: Add `<summary>` describing the endpoint.

## False Positives from Review

1. **No `[Authorize]` attribute** — FALSE. `HasUserPermissionRequirementFilter.OnAuthorizationAsync()` returns `UnauthorizedResult` when `UserExternalId` is null. E2E test confirms 401 for anonymous requests.
2. **Module/billing queries run for SuperAdmin** — FALSE. The filter has `if (!_httpContextService.IsSuperAdmin)` guard BEFORE the queries.
3. **No pagination is a bug** — FALSE. Stores are retail locations (tens to low hundreds per tenant). Pagination adds complexity with negligible benefit at current scale.

## Additional Findings

### AF-1 — No non-superadmin E2E tests
All 4 tests cover SuperAdmin (3) or anonymous (1). The buggiest path (non-superadmin, StoresAdmin role) has zero coverage.

### AF-2 — `[Authorize]` missing from ENTIRE controller
The `StoresController` and `BaseApiController` lack `[Authorize]`. Relies 100% on `[HasPermission]` filter. Works but breaks convention.

## Recommended Fix Priority

| Priority | Fix | Effort | Risk |
|----------|-----|--------|------|
| P0 | 🔴 Non-superadmin: filter by user (use `GetActiveStoresByUserIdAsync`) | Med | HIGH — changes data contract for non-superadmins |
| P0 | 🔴 OwnerName NRE: add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both repo methods | Low | Low |
| P1 | 🟡 Push DefaultStore filter to DB level | Low | Low |
| P1 | 🟡 Remove hardcoded `true`, add `includeInactive: false` | Low | Low |
| P2 | 🟢 Add `[ProducesResponseType(401/403)]` + XML docs | Low | None |
| P3 | 🟢 Add non-superadmin E2E tests | Med | Low |
