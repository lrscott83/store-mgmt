# Tasks: billing-debt-items-3-4-5

## Phase 1: Configurable DueSoonDays (Item 3)

- [x] 1.1 **SystemConfigurationType.cs** — Add `[Description("DueSoonDays")] DueSoonDays = 4` to the enum.
- [x] 1.2 **ISystemConfigurationRepository.cs** — Declare `Task<int> GetDueSoonDaysAsync();`.
- [x] 1.3 **SystemConfigurationRepository.cs** — Implement `GetDueSoonDaysAsync()` via `FirstOrDefaultAsync(c => c.Id == (int)SystemConfigurationType.DueSoonDays)`, fallback `5`. Seed `("DueSoonDays", "5")` in `SystemConfigurationEntityTypeConfiguration`.
- [x] 1.4 **BillingService.cs** — Replace hardcoded `dueSoonDays` literal `5` with `GetCachedConfigAsync("DueSoonDays", _configRepository.GetDueSoonDaysAsync)`.
- [x] 1.5 **GetStoresToCollectQuery.cs** — Replace hardcoded `5` with `_systemConfigurationRepository.GetDueSoonDaysAsync()`.
- [x] 1.6 **BillingServiceTests.cs / GetStoresToCollectQueryTests.cs** — Mock `GetDueSoonDaysAsync()` in existing tests.

**Verify**: `dotnet build src/StoreMgmt.sln`

## Phase 2: Delete Orphaned Domain.Tests (Item 4)

- [x] 2.1 **backend/src/Domain.Tests/** — `git rm -r` the folder (3 stale files, no `.csproj`, no `SMCA.sln` reference).

**Verify**: `dotnet build src/StoreMgmt.sln` — no references break; coverage intact in `Domain.UnitTests`.

## Phase 3: trialDays → trialMonths Rename (Item 5)

- [x] 3.1 **BillingService.cs** — Rename `trialDays` local variable to `trialMonths` (no behavioral change).

**Verify**: `dotnet test src/StoreMgmt.sln` — all tests pass.

## Rollback

Revert the single batch commit `42deff4b` for this change, or `git checkout` the 6 affected paths (enum, repo interface/impl, billing service, to-collect query, tests) and re-add the `Domain.Tests` folder.
