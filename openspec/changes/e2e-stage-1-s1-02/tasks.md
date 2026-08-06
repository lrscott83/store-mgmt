# Tasks: S1-02 — E2E coverage for inactive-store login → 403 `Store.Inactive`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~30 (1 file) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit — no PRs (session override: commits only on `feat/e2e-s1-02`) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add `Login_with_inactive_store_returns_403` | none (single commit) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Auth"` | Real PostgreSQL `localhost:5432` db `smca_test` via `WebAppFixture` (applies migrations) | `git revert` the commit — `AuthLoginFailureTests.cs` returns to prior state; no other file touched |

## Phase 1: Test Implementation (ADD-ONLY)

- [x] 1.1 In `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` add `[Fact] Login_with_inactive_store_returns_403` mirroring `:42-61`; seed `var f = await UserSeed.SeedOwnerAdminWithStoreAsync(_factory)` — MANDATORY seed (creates the `StoreUser` row at `UserSeed.cs:61`; `StoreSeed.SeedStoresAdminUserAsync` omits it and would pass for the wrong reason)
- [x] 1.2 In `try`: `await StoreSeed.DeactivateStoreAsync(_factory, f.StoreId)`, then `POST /api/v1/auth/login` with `{ Login = f.Login, Password = "Password123" }`
- [x] 1.3 Assert `res.StatusCode == HttpStatusCode.Forbidden`, `body.Succeeded == false`, `body.Errors.ContainSingle(e => e.Code == "Store.Inactive")` — deserialize via `ApiResponse<object>(ApiResponse.Json)` per `:32-33` pattern
- [x] 1.4 In `finally`: `await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId)` — FK-safe; NOT `DbTestHelpers.CleanupUserAsync` (strands rows via FK `Owner_User_UserId`)
- [x] 1.5 Zero edits to existing Facts `:21-40, :42-61` and zero production code (CLAUDE.md rule) — confirm with `git diff` showing only additions
- [x] 1.6 Commit (conventional, test-only): `test(e2e): cover inactive-store login returning 403 Store.Inactive`

## Phase 2: Verification

- [ ] 2.1 Filtered E2E: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Auth"` — new Fact passes against real DB
- [ ] 2.2 Full suite: `dotnet test backend/src/SMCA.sln` — all existing tests stay green (proves ADD-ONLY)
- [ ] 2.3 `git diff --stat` shows only `AuthLoginFailureTests.cs`; grep suite for `Store.Inactive` now ≥1 match

## Out of Baseline / Non-Goals

- StoreUser sibling `[Fact]` (spec Req 2, `AuthenticationService.cs:127-128`): NOT in baseline — excluded unless the user opts in
- Rate-limit 429 assertion: unreachable under `Testing` env (README H-12) — out of scope
- Playwright/frontend S1-02 coverage: out of scope
- Docs touches (`docs/testing/e2e-stage-1/S1-02.md:72,80` flip, README status): handled by a later orchestrator-owned change — not tasked here
