# Apply Progress: e2e-b6-me-inactive-404

**Phase**: sdd-apply
**Status**: success — all tasks complete, ready for verify
**Mode**: Standard (E2E-only, non-strict TDD)
**Date**: 2026-08-10
**Branch**: feat/e2e-b6-me-inactive-404

## Summary

Implemented the B-6 add-only coverage delta: ONE new E2E file
`backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` with EXACTLY TWO
tests. No production code, no existing E2E test, no support file touched.

- **T1** `Deactivated_same_tenant_store_user_me_returns_404_account_inactive` — proves
  the full HTTP chain: REAL login (200 + `AuthToken`) BEFORE deactivation → minted OA
  (Management module) `POST /api/v1/users/activate {IsActive=false}` → 200 + DB
  read-back `IsActive==false` via `IgnoreQueryFilters` → target REAL token
  `GET /api/v1/auth/me` → 404 + `Succeeded==false` + `ActionCode==404` +
  `Errors.ContainSingle(e => e.Code == "Auth.AccountInactive")`, exactly ONE `/me` call.
  Cleanup: `CleanupStoreGraphAsync(su.StoreId, su.UserId, su.OwnerUserId)` +
  `CleanupStoreGraphAsync(oa.StoreId, oa.UserId)`.
- **T2** `Cross_tenant_activate_returns_404` — minted OA (tenant A, Management module)
  activates a victim seeded in a MINIMAL tenant B (`Tenant.Create` + `User.Create` +
  `UserRole.Create(StoreUser)` only — no Store/StoreUser/StoreModule rows, FK-safe) →
  404 + `Succeeded==false` + `Errors.NotBeEmpty()` (envelope-only, NO code pin — the
  wire yields `App.Unexpected` via `ErrorHandlerMiddleware`). Cleanup:
  `CleanupTenantCascadeAsync(tenantB)` + `CleanupStoreGraphAsync(oa.StoreId, oa.UserId)`.

Deactivation goes ONLY through the activate API — `UserSeed.DeactivateUserAsync` was
deliberately not used (silent NoTracking no-op).

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthMeDeactivation" --no-restore` → **Passed! Failed: 0, Passed: 2, Total: 2** |
| Runtime harness command/scenario and exact result | Real PostgreSQL `localhost:5432`, db `smca_test` (WebAppFixture applies migrations); real HTTP login → activate → `/me` against the app. Focused run green; regression `~Auth|~UsersActivate` → **Passed! Failed: 0, Passed: 93, Total: 93** |
| Rollback boundary | Delete `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` — no other file touched |

## Verification (Phase 4)

1. Focused: **2 passed, 0 failed** (both `[Fact]`s, real PostgreSQL).
2. Regression: **93 passed, 0 failed** (`FullyQualifiedName~Auth|FullyQualifiedName~UsersActivate`) — no pre-existing test touched or failed.
3. Purity: `git status --porcelain` shows the ONLY new file created by this apply is
   `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs`; `git diff --stat`
   shows only the two pre-existing modified delta-spec files
   (`openspec/specs/authorization-e2e/spec.md`, `openspec/specs/users-e2e/spec.md`).
   The untracked `frontend-react/openspec/changes/offline-roster-login-actions/` dir is
   pre-existing and unrelated (verified present before apply started).

## Task Completion

- [x] 1.1 Scaffold file (namespace, collection, ctor, usings)
- [x] 2.1 Seed OA+Mgmt + StoreUser; REAL login target → 200 + AuthToken (before deactivation)
- [x] 2.2 Minted OA → activate {false} → 200; DB read-back IsActive==false
- [x] 2.3 Target REAL token → /me → 404 + AccountInactive contain-single; one /me call
- [x] 2.4 finally cleanup both store graphs
- [x] 3.1 OA+Mgmt tenant A + minimal tenant-B victim seed (local helper)
- [x] 3.2 Minted OA → activate {victim} → 404 envelope (no code pin)
- [x] 3.3 finally cleanup tenant B cascade + OA graph
- [x] 4.1 Focused run green (2/2)
- [x] 4.2 Regression green (93/93)
- [x] 4.3 Purity: single new file + openspec artifacts only

## Deviations from Design

None — implementation matches design (D1–D7 all followed).

## Notes / Risks

- The `[ERR] Unhandled exception: User not found` line in test output during the
  focused and regression runs is the EXPECTED cross-tenant/nonexistent 404 path: the
  handler throws `ApiException` which `ErrorHandlerMiddleware` logs before converting
  to the 404 envelope. Same behavior as the pre-existing `Activate_nonexistent_returns_404`.
- Open design question (not blocking): if `ActivateUserCommand` ever sets `AcctionCode`,
  the cross-tenant wire code changes — the envelope-only assert in T2 stays green by design.
