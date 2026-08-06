# Tasks: E2E Isolation on PUT /v1/users/{id} — Cross-Tenant RED + Cross-Store GREEN

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-220 (1 new file, additions only) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | New `UsersIsolationTests.cs` with E2E-I1 (RED) + E2E-I2 (GREEN) | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~UsersIsolationTests"` | Real PostgreSQL `smca_test` via `WebAppFixture` (E2E suite IS the runtime harness; no separate harness needed) | Delete `UsersIsolationTests.cs` — zero other files touched; suite returns to prior state |

## Phase 1: Scaffolding

- [ ] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs`: `[Collection("e2e")]`, `public sealed class UsersIsolationTests`, ctor `WebAppFixture` (house pattern `UsersUpdateTests.cs:10-15`). Zero edits to any existing file.

## Phase 2: E2E-I1 — Cross-Tenant RED (documented)

- [ ] 2.1 Add `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404`: caller `UserSeed.SeedOwnerAdminWithStoreAsync(_f)` (Store A, DefaultTenant).
- [ ] 2.2 Add private `SeedCustomTenantVictimAsync` returning `(TenantId, UserId, Login)` — copy CPW7 pattern (`UsersChangePasswordTests.cs:206-218`) + Login: `Tenant.Create` + `User.Create` + `UserRole.Create` with tenant ≠ caller's; login `xtenant-{Guid.NewGuid():N}@test.com`.
- [ ] 2.3 PUT victim `{ FullName = $"Edited by {Guid.NewGuid():N}" }`; assert order: HTTP 200 → `Succeeded==false` → `ActionCode==404` → `Errors.ContainSingle(e => e.Code == "User.NotFound")` → `GetUserByLoginAsync` FullName unchanged (design.md:50).
- [ ] 2.4 Cleanup in `finally` (CPW7 order :135-136): `CleanupTenantCascadeAsync(_f, tenantId)` → `CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)`.
- [ ] 2.5 Acceptance: today MUST fail on the `Succeeded==false` assert (actual `Succeeded=true`) — documented RED (user-approved); NO code change to make it green; no-write assert is not reached.

## Phase 3: E2E-I2 — Cross-Store GREEN

- [ ] 3.1 Add `Update_owner_admin_updates_user_in_other_store_returns_200`: caller `UserSeed.SeedOwnerAdminWithStoreAsync(_f)`; target `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null)` (Store B, same DefaultTenant).
- [ ] 3.2 PUT target; assert HTTP 200 → `Succeeded==true` → `GetUserByLoginAsync` FullName == new value (design.md:51).
- [ ] 3.3 Cleanup in `finally` (UsersUpdateTests.cs:109,248 order): `CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)` then `CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId)`.

## Phase 4: Verification

- [ ] 4.1 Focused run `--filter "FullyQualifiedName~UsersIsolationTests"` → expect 1 failed (RED right reason: `Succeeded=true` vs asserted `false`) / 1 passed; record exact result.
- [ ] 4.2 Users regression `--filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Users"` → fully green (existing tests untouched).
- [ ] 4.3 Confirm `git status` shows ONLY the new file; asserts use status + envelope + stable `Code` keys only (never localized `Description`).
