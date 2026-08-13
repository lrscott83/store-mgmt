# Tasks: b3-login-roundtrip — truthful B-3 plan + pin residual StoreUser login branches

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~110–130 (2 facts ≈ 100; doc ≈ 20) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit (commit-only branch, no PR) |
| Delivery strategy | ask-on-risk (commit-only override) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | 2 additive facts + B-3 doc correction | Single commit (no PR) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginStoreUserTests"` | Real PostgreSQL `smca_test` (localhost:5432, collection `e2e`) — full login roundtrip over HTTP | Revert commit: delete 2 facts + restore doc diff |

## Phase 1: Additive E2E Facts

File: `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` — append after the existing 3 facts; do NOT touch them.

- [x] 1.1 Add `[Fact] StoreUser_with_only_role_and_no_store_row_is_rejected_with_403`: seed `DbTestHelpers.SeedUserWithRoleAsync(_factory, (int)RoleType.StoreUser)` (no store graph); `POST /api/v1/auth/login`; assert 403, `Succeeded == false`, `Errors` contains exactly one `Code == "Store.Inactive"` (never `Auth.AccountInactive`); doc comment states intentional blind-zone contract (mirror ReSeller D6); `finally` → `DbTestHelpers.CleanupUserAsync(_factory, f.UserId)`.
- [x] 1.2 Add `[Fact] StoreUser_with_inactive_row_is_rejected_with_403`: seed `AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null)`; deactivate row via inline NoTracking-safe `db.Set<StoreUser>().IgnoreQueryFilters().Where(su => su.UserId == f.UserId).ExecuteUpdateAsync(s => s.SetProperty(su => su.IsActive, false))` (mirror `DeactivateOwnerByUserIdAsync`, DbTestHelpers.cs:217-226; NEVER query-then-mutate — NoTracking trap); login → 403, single `Store.Inactive`; doc comment: coverage pin, not user contract; `finally` → `AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId)`.

## Phase 2: Doc Correction

File: `docs/testing/e2e-stage-1/plan-backend.md`

- [x] 2.1 B-3 section: table (lines 106-111) StoreUser/ReSeller → DELIVERED (change `e2e-b3-auth-login-roundtrip`, 2026-08-09) + residual note "branch 1/2 pineados por b3-login-roundtrip"; fix stale "Estado actual" (line 102) and "ninguna probada por HTTP" (line 113); keep autorización note (line 115) verbatim.

## Phase 3: Verification (real PostgreSQL `smca_test`)

- [x] 3.1 Targeted: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginStoreUserTests"` → 5/5 green (3 existing + 2 new).
- [x] 3.2 ReSeller regression (D6 mirror): `--filter "FullyQualifiedName~AuthLoginReSellerTests"` → green.
- [x] 3.3 Full backend E2E suite: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → green once.
- [x] 3.4 Application regression: `dotnet test backend/src/Application.Tests/Application.Tests.csproj` → green.
- [x] 3.5 Scope gate: `git diff --stat` shows ONLY `AuthLoginStoreUserTests.cs` + `plan-backend.md`; zero production/existing-test edits; `git status` clean otherwise.

## Non-Goals

- No production code, no existing-fact edits, no helper modification (CLAUDE.md rules, carried verbatim in spec).
- No branches 3/5 (Store/Owner null — DB-impossible via FK); no ReSeller work; no rate-limit/refresh assertions.
