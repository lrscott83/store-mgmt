# Proposal: stores-by-current-user-fixes

## Intent

Fix 6 confirmed bugs in `GET /api/v1/stores/by-current-user`: non-superadmins currently see ALL stores in the tenant (data leak), `OwnerName` mapping crashes with NRE, DefaultStore filter runs client-side, and Swagger docs are incomplete.

## Scope

### In Scope
1. **BUG-1 (HIGH)**: Non-superadmin path filters stores by `Owner.UserId == currentUserId` using existing `GetActiveStoresByUserIdAsync()`, not `GetStoresAsync(true)`.
2. **BUG-2 (HIGH)**: Add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both repo query paths so `src.Owner.User.FullName` doesn't NRE.
3. **BUG-3 (MEDIUM)**: Push `s.Id != DefaultStore.Id` exclusion into repo query methods (before `.ToListAsync()`).
4. **BUG-4 (MEDIUM)**: Eliminated by BUG-1 — `GetActiveStoresByUserIdAsync()` already filters active stores only.
5. **BUG-5 (LOW)**: Add `[ProducesResponseType(401)]` and `[ProducesResponseType(403)]` to endpoint.
6. **BUG-6 (LOW)**: Add XML `<summary>` comment to endpoint method.
7. **AF-1**: Add E2E tests for non-superadmin (OwnerAdmin) role covering the fixed behaviors.

### Out of Scope
- Adding `[Authorize]` to controller or `BaseApiController` (FP-2 in exploration — not a security bug).
- Adding pagination to store queries (FP-3 — negligible benefit at current scale).
- Fixing same `[ProducesResponseType]`/XML issues on other controller endpoints (separate change).
- Adding StoreUser assignment-based filtering for non-owner store users (current permission model requires OwnerAdmin role).

## Approach

### Handler changes (`GetStoresByCurrentUserQuery.cs`)
- SuperAdmin path: keep `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync()`, but with added `.ThenInclude(o => o.User)` and `DefaultStore.Id` exclusion in the repo.
- Non-SuperAdmin path: replace `GetStoresAsync(true)` with `GetActiveStoresByUserIdAsync(_httpContextService.UserExternalId.ToGuid())`. This simultaneously fixes BUG-1 (user filtering), BUG-4 (active-only), and provides `Owner` include needed for BUG-2.
- Remove the client-side `stores.Where(s => s.Id != DefaultStore.Id).ToList()` — pushed to repo.

### Repository changes (`IStoreRepository.cs` + `StoreRepository.cs`)
- `GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync()`: add `.Include(s => s.Owner).ThenInclude(o => o.User)`, add `.Where(s => s.Id != defaultStoreId)` with a parameter.
- `GetActiveStoresByUserIdAsync()`: add `.ThenInclude(o => o.User)`, add `.Where(s => s.Id != defaultStoreId)` with a parameter.
- `GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync()`: same `.ThenInclude()` and default-store filter for consistency.
- Signature change: both methods accept `Guid? excludeDefaultStore = true` (default true to maintain existing behavior for other callers).

### Controller changes (`StoresController.cs`)
- Add XML summary: `/// <summary>Get stores accessible by the current user</summary>`.
- Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

### E2E tests (`StoresByCurrentUserTests.cs`)
- Add 2 tests: OwnerAdmin user sees only their stores, OwnerAdmin user sees OwnerName populated.
- Seed data: create a non-superadmin user with `OwnerAdmin` role, create stores belonging to that user's Owner.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Non-superadmin query | `GetActiveStoresByUserIdAsync()` | Filters by `Owner.UserId == userId` — correct for OwnerAdmin role required by `[HasPermission]`. No need to check StoreUsers since non-owner users can't access this endpoint. |
| DefaultStore filter | Add `excludeDefaultStore` param to repo methods | Keeps filter in DB query (not client-side). Default `true` to avoid breaking other callers of these methods. |
| `.ThenInclude(o => o.User)` | Add to both methods | Precedent exists in `GetPaidStoresAsync()` and `GetPaidStoresByReSellerUserAsync()`. Single JOIN, indexed FK, negligible perf impact. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/.../GetStoresByCurrentUserQuery.cs` | Modified | Replace `GetStoresAsync(true)` with `GetActiveStoresByUserIdAsync()`, remove client-side filter |
| `Domain/Interfaces/IStoreRepository.cs` | Modified | Add `excludeDefaultStore` param to existing methods |
| `Infrastructure/.../StoreRepository.cs` | Modified | Add `.ThenInclude(o => o.User)`, add `DefaultStore.Id` filter to both methods |
| `WebApi/Controllers/v1/StoresController.cs` | Modified | Add XML comment, `[ProducesResponseType(401/403)]` |
| `WebApi.E2ETests/Stores/StoresByCurrentUserTests.cs` | Modified | Add non-superadmin E2E tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Data contract change**: non-superadmins see fewer stores suddenly | Med | Verify frontend only shows stores the user owns. Add E2E test assertions. |
| **Callers of modified repo methods break** if `excludeDefaultStore` param added | Low | Set default value `true` — existing callers opt out by default. |
| **OwnerAdmin with no owned stores** gets empty list (but can't manage anything) | Low | Existing behavior — endpoint was already broken (NRE). Empty list is correct. |

## Rollback Plan

Revert all changes in a single commit. The endpoint goes back to its current broken state (NRE on non-superadmin, data leak on superadmin-only scenarios) — same as before.

## Dependencies

- Understanding of `_httpContextService.UserExternalId.ToGuid()` pattern (ubiquitous in codebase).
- `DataUtils.DefaultStore.Id` constant for exclusion filter.

## Success Criteria

- [ ] Non-superadmin (OwnerAdmin) user receives only their own active stores, not all tenant stores.
- [ ] `OwnerName` field is populated in response for both SuperAdmin and OwnerAdmin users.
- [ ] DefaultStore is excluded from results at DB level (not client-side).
- [ ] Swagger UI shows 401/403 response types for the endpoint.
- [ ] All existing E2E tests pass.
- [ ] New non-superadmin E2E tests pass (OwnerAdmin happy path).
