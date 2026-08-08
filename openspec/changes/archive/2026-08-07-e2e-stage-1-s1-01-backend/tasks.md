# Tasks: S1-01 backend — close 6 register data-assertion gaps (ADD-ONLY E2E)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300–350 (new test file ~280–330 + doc edit ~10) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit — no PR (session override: commits only on `feat/e2e-stage-1-s1-01-backend`) |
| Delivery strategy | commits-only (no PR) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | New `AuthRegisterDataAssertionsTests.cs` (6 facts) + S1-01.md checkbox correction | none (single commit) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthRegisterDataAssertionsTests" --no-build` | Real PostgreSQL `localhost:5432` db `smca_test` via `WebAppFixture` (applies migrations itself) | `git revert` the commit — one new test file + one doc edit; no production code, no existing test touched |

## Phase 1: Scaffold — new test file (ADD-ONLY)

- [x] 1.1 Create `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs` (namespace `SMCA.WebApi.E2ETests.Auth`): `[Collection("e2e")]`, sealed class, ctor `WebAppFixture` → `_factory`/`_client` mirroring `AuthRegisterSuccessTests.cs:15-25`. DONE: compiles; zero edits to existing files.
- [x] 1.2 In-file private helpers (D7): `record Registered(UserId, TenantId, StoreId, OwnerId)`; `RegisterAsync(storeName, code)` — POST `/api/v1/auth/register`, 201, `ApiResponse<AuthDto>` via `ApiResponse.Json`; tenant via `DbTestHelpers.GetUserByLoginAsync`; store/owner via scoped `ApplicationDbContext` reads scoped by `TenantId`; `SeedReSellerAsync(code)` — User + UserRole(ReSeller) + `ReSeller.Create(userId, true, 0, 25, DataUtils.DefaultTenant.Id, "E2E ReSeller")` per `RegisterStorePaymentTests.cs:49-56`. DONE: helpers compile.

## Phase 2: Six Facts — one RED at a time (tests ARE the implementation)

For each: write the `[Fact]`, run filtered test, expect **GREEN** (production already implements the documented behavior). FAIL = real divergence → STOP, report (H-1 alert for Fact 4).

- [x] 2.1 `Register_sets_SelectedStoreId_to_new_store_id` (Fact 1): `user = GetUserByLoginAsync(login)`, `store` scoped by `user.TenantId`, assert `user.SelectedStoreId == store.Id`; `finally` → `CleanupTenantCascadeAsync`. DONE: fact passes filtered.
- [x] 2.2 `Register_composes_owner_description_from_store_name` (Fact 2): assert `owner.Description == $"Nombre de la tienda: {storeName}"`. DONE: fact passes filtered.
- [x] 2.3 `Register_creates_store_with_test_description_and_not_approved` (Fact 3): assert `store.Description == "Tienda de prueba"` and `store.Approved == false`. DONE: fact passes filtered.
- [x] 2.4 `Register_assigns_all_available_modules_including_paid` (Fact 4, D2/D6): derive `expectedModuleIds` replicating `ModuleRepository.cs:17-23` filter (`m.IsActive && m.AvailableToStore && m.Features.Any(f => f.IsActive && f.AvailableToStore)`); `paidExpectedIds` adds `&& !m.PriceIncluded`; actual = `db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking().Where(sm => sm.StoreId == storeId)`; assert `BeEquivalentTo` + `paidExpectedIds.Should().NotBeEmpty()` + non-empty intersection; NEVER hardcode counts. DONE: fact passes filtered with ≥1 paid module.
- [x] 2.5 `Register_response_has_no_refresh_token` (Fact 5): assert `body.Data.RefreshToken` is null and `RefreshTokenExpiresAt` is null (`TestDtos.cs:12-13`). DONE: fact passes filtered.
- [x] 2.6 `Register_with_reseller_code_creates_ReSellerOwner` (Fact 6, D4/D5): seed ReSeller via `SeedReSellerAsync`; register with `Code`; assert `ReSellerOwner` where `OwnerId == owner.Id`: `ReSellerId == seeded.Id`, discounts == seeded (0/25), `TenantId == registered tenant`. Cleanup ORDER (critical): `finally` 1) delete `ReSellerOwner` explicitly (`RegisterStorePaymentTests.cs:120-121`), 2) `CleanupTenantCascadeAsync(registered tenant)`, 3) delete seeded `ReSeller` row, 4) `CleanupUserAsync(seeded userId)`. DONE: fact passes; no FK-violation/leak (re-run suite clean).

## Phase 3: Doc correction

- [x] 3.1 `docs/testing/e2e-stage-1/S1-01.md:53-59`: flip the 6 UNCOVERED checkboxes (lines 53, 54, 55, 56, 58, 59) `[x]`→`[ ]`; add note "comportamiento verificado por lectura de código; cobertura E2E nueva en e2e-stage-1-s1-01-backend" (user-approved wording). Keep line 57 (`PaymentStartDate`, covered by `StoreCreationTrialTests.cs:331`) and line 52 (`Owner`/`Store` exist, `AuthRegisterSuccessTests.cs:60-61`) as `[x]`. DONE: exactly 6 flips + note; no other doc/test touched.

## Phase 4: Verification + commit

- [x] 4.1 Full suite: `dotnet test backend/src/SMCA.sln` — all green; report pass counts.
- [x] 4.2 Filtered proof: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthRegisterDataAssertionsTests" --no-build` — 6/6 pass.
- [x] 4.3 ADD-ONLY proof: `git diff --stat` shows ONLY the new file + `S1-01.md`; grep suite for `Nombre de la tienda` / `Tienda de prueba` now ≥1 match. DONE: diff is pure additions + doc edit.
- [x] 4.4 Commit (conventional, test-only): `test(e2e): assert S1-01 register data facts (SelectedStoreId, owner/store descriptions, modules incl. paid, no refresh token, ReSellerOwner)`. No PR. [ARCHIVED 2026-08-07: reconcile — commit `edcf7397` exists in git with this exact message and ADD-ONLY stat (+309 new test file, S1-01.md 14±); orchestrator-owned commit task; per verify-report #658 and Task Completion Gate exceptional path.]

## Non-Goals

- Zero production-code changes (CLAUDE.md). Zero edits to existing E2E tests (`AuthRegisterSuccessTests.cs` untouched — D1).
- `PaymentStartDate`/`ExpiresIn` re-assertion: already covered (D3). No `Clock.Pin`.
- Frontend/Playwright, rate-limit 429 (unreachable under `Testing`): out of scope.
