# Proposal: e2e-b3-auth-login-roundtrip

## Intent

Every real HTTP login E2E today covers SuperAdmin and OwnerAdmin. The StoreUser six-condition chain (`AuthenticationService.cs:125-144`) and the ReSeller short-circuit (`:68-77`, which bypasses HasActiveStore entirely) are unproven over HTTP. MintToken-backed tests (>=8) never exercise `AuthenticationService`, leaving a blind zone the size of the whole handler: a role-only ReSeller user (UserRole ReSeller, no `ReSeller` row) would fail real login with 403 `Store.Inactive` while still minting tokens. This change closes that gap with NEW E2E tests only.

## Goals

- Prove both StoreUser and ReSeller login roundtrips over HTTP: positives + negatives.
- Pin the blind-zone contract: role-only ReSeller real login MUST return 403 `Store.Inactive`.
- Zero production changes; zero existing-test changes.
- TDD mode: **Standard** — backend E2E-only changes follow owners-* precedent (`strict_tdd` not active).

## Scope

### In Scope
- NEW `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs`
  - Positive: `AuthzSeed.SeedStoreUserAsync` -> POST /api/v1/auth/login -> 200, `Succeeded=true`, non-empty `AuthToken`, `Login` matches. Store graph: User + StoreUser + active Store + Store's Owner (different User).
  - Negative: store deactivated (`StoreSeed.DeactivateStoreAsync`) -> 403 `Store.Inactive`.
  - Negative: store's owner deactivated -> 403 `Store.Inactive`.
- NEW `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs`
  - Positive: active User + `ReSeller.Create(...)` row (IsActive default true) -> 200.
  - Negative: `ReSeller.IsActive=false` -> 403 `Auth.AccountInactive`.
  - Negative (blind-zone pin): role-only ReSeller (no row, `DbTestHelpers.SeedUserWithRoleAsync` shape) -> 403 `Store.Inactive`.

### Out of Scope
- Verbatim scope rule: "In this backend test-coverage work the agent may ONLY ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and report instead of touching anything."
- Shared-helper refactors: ReSeller seed stays LOCAL (ToCollectTests pattern).
- Re-pinning the >=8 existing role-only MintToken tests.
- Rate-limit (429) and refresh-token lifecycle assertions.

## Capabilities

### New Capabilities
- `auth-login-reseller-e2e`: ReSeller login roundtrip coverage — 200 success, 403 `Auth.AccountInactive`, role-only blind-zone pin.

### Modified Capabilities
- `auth-login-e2e`: fulfills the OPTIONAL StoreUser sibling (Requirement 2, archived not-delivered) as a full roundtrip — positive login + 403 `Store.Inactive` for deactivated store and deactivated store owner.

## Approach

Mirror `AuthLoginOwnerAdminTests`: seed via shared `AuthzSeed`/`StoreSeed`/`DbTestHelpers`, POST login, assert `ApiResponse<AuthDto>` via `TestDtos.AuthData`. ReSeller seeds locally. Filter: `--filter "FullyQualifiedName~AuthLogin"`. Rate limiting disabled under `Testing` env.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | New | StoreUser roundtrip tests |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` | New | ReSeller roundtrip tests + local seed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Role-only 403 misread as bug | Med | Test name + comment document intentional contract |
| Orphaned refresh-token rows | Low | Pre-existing; no FK; suite clears via ResetDataAsync |
| ~4-6 extra HTTP logins | Low | Trivial suite cost |

## Rollback Plan

Delete the two new test files. Nothing else changes, so revert is pure file removal.

## Dependencies

- PostgreSQL `localhost:5432` db `smca_test`; `WebAppFixture` applies migrations.
- Reuse as-is: `AuthzSeed.SeedStoreUserAsync`, `AuthzSeed.CleanupStoreGraphAsync`, `StoreSeed.DeactivateStoreAsync`, `DbTestHelpers.CleanupUserAsync`, `DbTestHelpers.HashPassword`.

## Success Criteria

- [ ] Both new files compile and run green under `FullyQualifiedName~AuthLogin`.
- [ ] StoreUser covered: 1 positive + 2 negatives.
- [ ] ReSeller covered: 1 positive + 2 negatives (inactive row; role-only pin).
- [ ] `git diff --stat` shows only 2 added test files (no production/existing-test changes).