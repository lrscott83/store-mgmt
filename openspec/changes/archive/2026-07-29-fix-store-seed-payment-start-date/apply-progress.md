# Apply Progress: fix-store-seed-payment-start-date

**Status**: ✅ Complete — all 10 tasks across 4 phases implemented and verified
**Mode**: Standard (no TDD configured for this change)
**Backfilled**: 2026-07-31 (artifact was missing from archive; verified against real code + git history)

## Implementation Summary

Free stores were being seeded with `PaymentStartDate = today` in the E2E test
fixtures while production correctly defaults to `null`, and the `StoreDto`
exposed the sentinel `0001-01-01` for free stores. Fixed by dropping the
explicit `paymentStartDate` argument from `Store.Create()` calls in the seed
(domain default is `null`), making the DTO nullable, and aligning the single
failing assertion.

## Commits

The change landed across two commits (both part of SDD-batch API fixes on
2026-07-30; the archived folder is dated 2026-07-29 — the apply/verify reports
were saved to Engram before the code landed in git):

| Commit | Date | Files |
|--------|------|-------|
| `abe067ec` — fix(api): resolve 6 issues in POST /api/v1/stores endpoint | 2026-07-30 | `StoreDto.cs` (Phase 1) |
| `42deff4b` — fix(api): resolve bugs across stores, auth, users endpoints (SDD batch) | 2026-07-30 | `TestDtos.cs`, `StoreSeed.cs`, `StoreGetByIdTests.cs` (Phases 1–3) |

## Tasks Completed

### Phase 1: DTO Contract — Make PaymentStartDate Nullable
- [x] 1.1 `Application/Dtos/StoreManagement/StoreDto.cs` — `DateOnly` → `DateOnly?` (line 16)
- [x] 1.2 `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` — `DateOnly` → `DateOnly?` in `StoreData` (line 22)
- [x] 1.3 Verify: `dotnet build backend/src/Application/Application.csproj`

### Phase 2: E2E Seed — Drop Explicit paymentStartDate Args
- [x] 2.1 `StoreSeed.cs` — 5th arg removed in `SeedStoreAsync` (line 45)
- [x] 2.2 `StoreSeed.cs` — 5th arg removed in `SeedStoresAdminUserAsync` (line 64)
- [x] 2.3 `StoreSeed.cs` — 5th arg removed in `SeedStoreInNewTenantAsync` (line 86)
- [x] 2.4 Verify: `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`

### Phase 3: E2E Assertion — Expect Null for Free Store
- [x] 3.1 `StoreGetByIdTests.cs` — `.Be(today)` → `.BeNull()` (line 31), removed unused `today` variable
- [x] 3.2 Verify: `dotnet test ... --filter "StoreGetByIdTests"` → PASS (4/4)

### Phase 4: Full Regression
- [x] 4.1 Run: `dotnet test backend/src/SMCA.sln` → ALL PASS

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/Application/Dtos/StoreManagement/StoreDto.cs` | Modified | `DateOnly PaymentStartDate` → `DateOnly?` (line 16) |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modified | `StoreData.PaymentStartDate` → `DateOnly?` (line 22) |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/StoreSeed.cs` | Modified | Dropped `DateOnly.FromDateTime(DateTime.UtcNow)` 5th arg from 3 `Store.Create()` calls (lines 45, 64, 86) |
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreGetByIdTests.cs` | Modified | Assertion `.Be(today)` → `.BeNull()`; deleted unused `today` local |

## Verification Runs (fresh, 2026-07-31)

| Command | Result |
|---------|--------|
| `dotnet build backend/src/SMCA.sln` | ✅ 0 errors (8 pre-existing NU190x package warnings) |
| `dotnet test SMCA.WebApi.E2ETests.csproj --filter "StoreGetByIdTests"` | ✅ 4/4 passed |
| `dotnet test backend/src/SMCA.sln` | ✅ 559/559 passed (22 Domain.UnitTests + 300 Application.Tests + 237 E2E) |

## Deviations from Design

None in code. The design listed 3 files; tasks additionally required
`TestDtos.cs` (test-side mirror DTO) — applied as specified in tasks.md.

## Issues Found

- None blocking. Note: test count grew from the 230 reported at archive time to
  559 at HEAD because the implementation landed inside broader SDD-batch commits
  that added further tests (e.g., `StoresListTests`, `GetStoresQueryTests`).

## Remaining Tasks

None — all 10/10 tasks complete. Ready for verification.
