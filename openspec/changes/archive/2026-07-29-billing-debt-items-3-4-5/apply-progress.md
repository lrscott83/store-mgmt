# Apply Progress: billing-debt-items-3-4-5

## Status
7/7 tasks complete. All changes applied in single commit `42deff4b` ("fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)").

## Completed Tasks

### Phase 1: Configurable DueSoonDays (Item 3)
- [x] 1.1 SystemConfigurationType.cs — Added `DueSoonDays = 4` with description
- [x] 1.2 ISystemConfigurationRepository.cs — Declared `Task<int> GetDueSoonDaysAsync()`
- [x] 1.3 SystemConfigurationRepository.cs — Implemented accessor with fallback `5`; seed row `("DueSoonDays", "5")`
- [x] 1.4 BillingService.cs — `dueSoonDays` now from `GetCachedConfigAsync("DueSoonDays", _configRepository.GetDueSoonDaysAsync)`
- [x] 1.5 GetStoresToCollectQuery.cs — `dueSoonDays` now from `_systemConfigurationRepository.GetDueSoonDaysAsync()`
- [x] 1.6 BillingServiceTests.cs / GetStoresToCollectQueryTests.cs — Mock `GetDueSoonDaysAsync()` (5)

### Phase 2: Delete Orphaned Domain.Tests (Item 4)
- [x] 2.1 backend/src/Domain.Tests/ — Folder deleted; `SMCA.sln` builds without it

### Phase 3: trialDays → trialMonths Rename (Item 5)
- [x] 3.1 BillingService.cs — `trialDays` renamed to `trialMonths`

## Files Changed
| File | Action | Description |
|------|--------|-------------|
| `Domain/Common/Enums/SystemConfigurationType.cs` | Modified | Added `DueSoonDays = 4` |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Modified | Added `GetDueSoonDaysAsync()` |
| `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | Modified | Implemented accessor |
| `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` | Modified | Seed `("DueSoonDays", "5")` |
| `Application/Services/Billing/BillingService.cs` | Modified | Repo-driven `dueSoonDays`; `trialMonths` rename |
| `Application/.../GetStoresToCollect/GetStoresToCollectQuery.cs` | Modified | Repo-driven `dueSoonDays` |
| `Application.Tests/Services/Billing/BillingServiceTests.cs` | Modified | Mock `GetDueSoonDaysAsync()` |
| `Application.Tests/.../GetStoresToCollectQueryTests.cs` | Modified | Mock `GetDueSoonDaysAsync()` |
| `backend/src/Domain.Tests/` | Deleted | Orphaned folder (3 stale files) |

## Build
`dotnet build` — succeeded (part of batch commit; no errors attributable to this change).
