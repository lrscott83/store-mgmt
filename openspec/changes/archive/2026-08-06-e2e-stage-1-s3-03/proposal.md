# Proposal: E2E Isolation on PUT /v1/users/{id} — Cross-Tenant RED + Cross-Store GREEN

## Intent

`PUT /v1/users/{id}` has no tenant/store guard (`UpdateUserCommand.cs:50-51`) and `GetByIdAsync` is `FindAsync` (`GenericRepository.cs:82-85`), which skips the global tenant filter — sibling E2E-CPW7 already proved cross-tenant writes succeed. S3-03 H-11 demands this isolation be asserted; this change pins the invariant with **tests only**.

## Scope

### In Scope
- NEW `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs` (`[Collection("e2e")]` + `WebAppFixture`), 2 tests:
  1. `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` — RED invariant
  2. `Update_owner_admin_updates_user_in_other_store_returns_200` — GREEN characterization

### Out of Scope
- Production tenant guard (separate future change)
- Edits to existing tests/helpers (`StoreSeed.SeedStoreInNewTenantAsync`, `UsersChangePasswordTests.cs`)
- Playwright; `docs/testing/e2e-stage-1/S3-03.md` untouched

## Documented RED Decision (user-approved)

Test 1 asserts HTTP 200 (controller always `Ok` — `UsersController.cs:69`) + envelope `Succeeded=false` + `ActionCode=404` + `User.NotFound` + **no DB write**. **Today it fails** (200 + `Succeeded=true` + write persists) — intentional, USER-APPROVED. The verify phase records a documented `fail` (AUTH-INV-01 precedent: the red is the defect, not the test); the change is **NOT blocked**. Coupling warning: the future fix must mirror `UpdateUserPasswordCommand.cs:62-64` (TenantId-only guard) so it does NOT block test 2's legit same-tenant path.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `users-e2e`: R3 (Update User) area ADDED — E2E-I1 cross-tenant envelope-404 invariant (RED until the guard ships); E2E-I2 cross-store same-tenant 200 characterization (GREEN).

## Approach

House pattern; body `{ FullName = $"Edited by {Guid.NewGuid():N}" }`; Guid-suffixed logins/tenants.
- **Test 1**: caller `UserSeed.SeedOwnerAdminWithStoreAsync` (DefaultTenant). Victim: inline custom-tenant seed mirroring CPW7 (`Tenant.Create` + `User.Create` + `UserRole.Create`), tenant ≠ caller's. Cleanup (finally): `DbTestHelpers.CleanupTenantCascadeAsync` → `AuthzSeed.CleanupStoreGraphAsync`.
- **Test 2**: caller same; target `AuthzSeed.SeedStoreUserAsync(grantedFeatureId: null)` (own Store B, same DefaultTenant). Cleanup (finally): `CleanupStoreGraphAsync` for both graphs (`UsersUpdateTests.cs:109,248`).
- DB asserts via `DbTestHelpers.GetUserByLoginAsync` (`IgnoreQueryFilters`). Assert status + envelope + stable `Code` keys only — never localized `Description` (culture coupling).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs` | New | 2 isolation tests |
| `openspec/specs/users-e2e/spec.md` | Modified (at archive) | R3 rows for E2E-I1 / E2E-I2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Test 1 RED until guard ships | High (by design) | Documented-fail verify gate; user-approved |
| Culture coupling on error asserts | Med | Status + envelope + `Code` keys only |
| Collision with 13 `UsersUpdateTests` | Low | New file; names verified unique |

## Rollback Plan

Delete the new file. Purely additive diff — no existing test/helper touched; suite returns to prior state.

## Dependencies

PostgreSQL `smca_test`; existing seeds (`UserSeed`, `AuthzSeed`, `DbTestHelpers`); no new seed helper.

## Success Criteria

- [ ] Test 2 GREEN; Test 1 fails exactly on the invariant (documented RED)
- [ ] Verify report records the documented fail; change not blocked
- [ ] Zero edits to existing E2E tests; zero production code changes
