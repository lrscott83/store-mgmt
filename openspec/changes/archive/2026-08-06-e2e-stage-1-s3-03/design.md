# Design: E2E Isolation on PUT /v1/users/{id} — Cross-Tenant RED + Cross-Store GREEN

## Technical Approach

Tests-only change. One new E2E file with exactly 2 tests asserting the tenant-scope invariant on `PUT /v1/users/{id}`: cross-tenant → envelope 404 + no DB write (documented RED today); same-tenant cross-store → 200 + write persists (GREEN). Every seed/cleanup/assert pattern mirrors existing house code: `UsersChangePasswordTests.cs` (CPW7) for the cross-tenant victim, `UsersUpdateTests.cs` for PUT shape and cleanup. Zero production code; zero edits to existing tests/helpers. Implements E2E-I1/E2E-I2 (`specs/users-e2e/spec.md`).

## Architecture Decisions

| # | Option A | Option B | Decision |
|---|----------|----------|----------|
| D1 Test placement | Append to `UsersUpdateTests.cs` (13 tests) | **New `UsersIsolationTests.cs`** `[Collection("e2e")]` | New file — purely additive diff, no name collision, S3-03's cited line numbers stay stable (explore.md:55) |
| D2 Cross-tenant assert | Pin current 200+`Succeeded=true` (H-10 style) | **RED invariant** (envelope 404 + no write) | RED — same `FindAsync` hole already fixed by guard on sibling endpoint (E2E-CPW7); characterization would enshrine the IDOR and mask the regression (explore.md:94-97) |
| D3 Victim seed | Modify `StoreSeed`/`UsersChangePasswordTests` | **Copy CPW7 pattern inline** (extended to return Login) | Copy — verbatim rule forbids touching existing tests; helper is private (`UsersChangePasswordTests.cs:206-218`) |
| D4 Assert style | Assert `Errors[].Description` | **Status + envelope + stable `Code` keys only** | Code keys — culture-coupling regression precedent (delete-user Batch B, spec.md:26); DB reads via `GetUserByLoginAsync` (`IgnoreQueryFilters`, DbTestHelpers.cs:77-82) |
| D5 Verify gate | Block change on RED test | **Record documented `fail`, change NOT blocked** | Documented fail — AUTH-INV-01 precedent ("el rojo es el defecto, no el test"); future fix must mirror `UpdateUserPasswordCommand.cs:62-64` (TenantId-only guard) without blocking E2E-I2 |

## Data Flow

    OwnerAdmin caller (DefaultTenant, Store A)
        │ PUT /api/v1/users/{victimId}   { FullName }
        ▼
    UsersController.UpdatedAsync  (always Ok → HTTP 200)
        ▼
    UpdateUserCommand ── GetByIdAsync = FindAsync (skips tenant query filter)
        ├─ E2E-I1 victim in other tenant → today: Succeeded=true + write  (RED; guard missing)
        └─ E2E-I2 target in Store B, same tenant → Succeeded=true + write  (GREEN)
        ▼
    DB assert: DbTestHelpers.GetUserByLoginAsync (IgnoreQueryFilters)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs` | Create | 2 isolation tests; `[Collection("e2e")]` + `WebAppFixture` ctor; private `SeedCustomTenantVictimAsync` copy (returns Login) |

No other files touched.

## Interfaces / Contracts

- **PUT body**: `new { FullName = $"Edited by {Guid.NewGuid():N}" }` (UsersUpdateTests.cs:24; validator requires `FullName`).
- **Envelope**: `ApiResponse<T>` (`Succeeded`, `ActionCode`, `Errors[].Code` — ApiResponse.cs:5-18); assert `Errors.ContainSingle(e => e.Code == "User.NotFound")` (UsersUpdateTests.cs:105).
- **Inline victim helper** (test 1): `Tenant.Create(tenantId, "E2E XTenant", "e2e", UtcNow)` + `User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E XTenant Victim", "0000000000", login, tenantId)` + `UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId)`; login `xtenant-{Guid.NewGuid():N}@test.com`; returns `(TenantId, UserId, Login)`.
- **Cleanup (finally, CPW7 order :135-136)**: `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId)` → `AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)`.
- **Test 2 cleanup (UsersUpdateTests.cs:109,248 order)**: `CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)` + `CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId)`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | E2E-I1 cross-tenant PUT → envelope 404 + no write | Assert order: HTTP 200 → `Succeeded==false` → `ActionCode==404` → `Errors` contains `User.NotFound` → `GetUserByLoginAsync` `FullName` unchanged. Documented RED today (`FindAsync` filter-skip). |
| E2E | E2E-I2 same-tenant cross-store PUT → 200 + write | `SeedOwnerAdminWithStoreAsync` (Store A) + `AuthzSeed.SeedStoreUserAsync(grantedFeatureId: null)` (Store B, same DefaultTenant); assert 200 → `Succeeded==true` → `GetUserByLoginAsync` `FullName` == new value. GREEN today. |

No unit/integration — change is E2E coverage only.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary (tests-only additive change).

## Migration / Rollout

No migration required. Rollback: delete the new file — suite returns to prior state (proposal.md rollback plan).

## Open Questions

None blocking. Operational note for verify: record the documented `fail` for test 1 (assert order above guarantees failure lands on the invariant, not on status or culture-coupled text) and do NOT block the change; the fix is a separate future change shipping the `UpdateUserPasswordCommand.cs:62-64`-style tenant guard.
