# Tasks: e2e-b3-auth-login-roundtrip

> **Scope rule (verbatim, non-negotiable)**: "In this backend test-coverage work the agent may ONLY ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and report instead of touching anything."
> TDD: Standard (owners-* precedent; strict_tdd overridden for E2E-only); files written complete, RED=absent→added, GREEN=passes. Threat Matrix N/A.

`E2E` = `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
`FUT` = `--filter "FullyQualifiedName~"` — needs Postgres localhost:5432 smca_test.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~270 (≈120 + ≈150) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `AuthLoginStoreUserTests.cs` (1 pos + 2 neg) | PR 1 | `E2E FUT AuthLoginStoreUserTests` | smca_test, real HTTP | Delete this file |
| 2 | `AuthLoginReSellerTests.cs` (1 pos + 2 neg) | PR 1 | `E2E FUT AuthLoginReSellerTests` | same | Delete this file |
| 3 | Auth regression | PR 1 | `E2E FUT AuthLogin`, then `E2E FUT Auth` | same | None (verify-only) |

## Phase 1: `AuthLoginStoreUserTests.cs` — StoreUser roundtrip (auth-login-e2e Req 2, MODIFIED)

- [x] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs`: `[Collection("e2e")]`, `WebAppFixture` ctor (mirror `AuthLoginOwnerAdminTests.cs:32-44`).
- [x] 1.2 RED→GREEN `StoreUser_logs_in_to_an_active_store`: `SeedStoreUserAsync(_f, null)` → POST `/api/v1/auth/login` → 200, `Succeeded=true`, token non-empty, `Login` matches.
- [x] 1.3 Neg store-deactivated (D2): `StoreSeed.DeactivateStoreAsync(_f, fixture.StoreId)` → 403 `Store.Inactive` (D7 `ContainSingle`).
- [x] 1.4 Neg owner-deactivated (D1): `DbTestHelpers.DeactivateOwnerByUserIdAsync(_f, fixture.OwnerUserId)` → 403 `Store.Inactive` (branch 6).
- [x] 1.5 `finally` cleanup (D3): `CleanupStoreGraphAsync(_f, fixture.StoreId, fixture.UserId, fixture.OwnerUserId)` — MUST pass `OwnerUserId` (spec cleanup scenario).

## Phase 2: `AuthLoginReSellerTests.cs` — ReSeller roundtrip (auth-login-reseller-e2e R1–R3, ADDED)

- [x] 2.1 Local `SeedReSellerAsync` (ToCollectTests pattern, `ToCollectTests.cs:36-53`): User + `UserRole.Create(userId, (int)RoleType.ReSeller)` + `ReSeller.Create(userId, true, 0, 25, tenantId, desc)` via tracked `Add`.
- [x] 2.2 Local `CleanupReSellerAsync` (D4, MANDATORY order): delete `ReSeller` row (UserId, `IgnoreQueryFilters`) FIRST, then `CleanupUserAsync`; FK Restrict throws if reversed.
- [x] 2.3 RED→GREEN `Active_re_seller_logs_in_with_no_store_graph` (R1): no store graph → 200, `Succeeded=true`, token non-empty, `Login` matches, `Errors` empty.
- [x] 2.4 Neg inactive row (R2, D5): `reSeller.IsActive = false` BEFORE `Add` (NoTracking trap) → 403 `Auth.AccountInactive` (D7).
- [x] 2.5 Neg role-only pin (R3, D6): `SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller)`, no `ReSeller` row → 403 `Store.Inactive`; intent-named test + comment flag blind-zone contract.
- [x] 2.6 `finally`: `CleanupReSellerAsync` for 2.3–2.4, `CleanupUserAsync` for 2.5; D8: no refresh-token cleanup.

## Phase 3: Verification

- [x] 3.1 `E2E FUT AuthLogin` — 6 new facts green.
- [x] 3.2 `E2E FUT Auth` — no regression (prior 69/69).
- [x] 3.3 `git diff --stat` shows ONLY the 2 new files — else STOP and report.

## Commit boundaries (work-unit-commits)

- `test(e2e): add StoreUser login roundtrip coverage` — Phase 1 file with tests.
- `test(e2e): add ReSeller login roundtrip coverage` — Phase 2 file with tests.