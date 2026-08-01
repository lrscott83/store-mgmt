# Design: billing-debt-items-3-4-5

## Technical Approach

Three independent, low-risk changes: (R3) configurable `DueSoonDays` via the existing `SystemConfiguration` pattern, (R4) delete an orphaned test folder, (R5) a rename that documents intent. No schema migration, no behavioral change to the status state machine.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|----------|--------|----------|--------|
| Config source | (A) `SystemConfigurationType` + repository accessor | (B) appsettings config — not per-tenant, no DB precedent. (C) keep hardcoded `5` — the debt itself | **A** — exact precedent: `PaymentGraceDays` (enum id 3) → `GetPaymentGraceDaysAsync()`. Same shape, id 4 → `GetDueSoonDaysAsync()` |
| Default when no row | `FirstOrDefaultAsync(c => c.Id == 4)?.Value ?? 5` | Inline `?? 5` vs constant | **Inline `?? 5`** — mirrors `GetPaymentGraceDaysAsync()` implementation; spec documents fallback `5` |
| Both call sites | `BillingService` + `GetStoresToCollectQueryHandler` read repo | Only one site updated leaves inconsistent window | **Both** — same `dueSoonDays` semantics across summary and to-collect query |
| `Domain.Tests` removal | `git rm -r` folder | Keep as dead code | **Delete** — verified orphan (no `.csproj`, no sln ref), coverage intact in `Domain.UnitTests` |
| Rename | `trialDays` → `trialMonths` local var | Skip (cosmetic) | **Rename** — variable feeds `GetNextDueDate(…, trialMonths, …)` which takes months; old name actively misled readers |

## Data Flow

```
BillingService.GetStoreBillingSummaryAsync()
  └─ dueSoonDays = await GetCachedConfigAsync("DueSoonDays", _configRepository.GetDueSoonDaysAsync)
       └─ SystemConfigurationRepository.GetDueSoonDaysAsync()
            └─ FirstOrDefaultAsync(c => c.Id == (int)SystemConfigurationType.DueSoonDays)?.Value ?? 5
       └─ trialMonths = Math.Max(1, await GetCachedConfigAsync("TestingPeriodInMonths", …))   ← renamed from trialDays
  └─ StoreBillingUtils.GetBillingStatus(…, dueSoonDays, …)   ← no hardcoded 5

GetStoresToCollectQueryHandler
  └─ dueSoonDays = await _systemConfigurationRepository.GetDueSoonDaysAsync()   ← replaces literal 5
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Domain/Common/Enums/SystemConfigurationType.cs` | Modify | Add `[Description("DueSoonDays")] DueSoonDays = 4` |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Modify | Add `Task<int> GetDueSoonDaysAsync();` |
| `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | Modify | Implement accessor; seed row `("DueSoonDays", "5")` in `SystemConfigurationEntityTypeConfiguration` |
| `Application/Services/Billing/BillingService.cs` | Modify | `dueSoonDays` from repo (line ~61); `trialDays` → `trialMonths` (line ~47) |
| `Application/.../GetStoresToCollect/GetStoresToCollectQuery.cs` | Modify | `dueSoonDays` from repo (line ~63) |
| `backend/src/Domain.Tests/` | Delete | 3 stale files, no `.csproj`, no sln reference |

## Interfaces / Contracts

```csharp
// Domain/Common/Enums/SystemConfigurationType.cs
DueSoonDays = 4,

// Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs
Task<int> GetDueSoonDaysAsync();

// Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs
public async Task<int> GetDueSoonDaysAsync()
{
    SystemConfiguration? systemConfiguration =
        await _systemConfigurations.FirstOrDefaultAsync(conf => conf.Id == (int)SystemConfigurationType.DueSoonDays);
    return systemConfiguration is null ? 5 : int.Parse(systemConfiguration.Value);
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `BillingService` uses repo value | Mock `ISystemConfigurationRepository.GetDueSoonDaysAsync()` → assert passed to `GetBillingStatus` (existing `BillingServiceTests`) |
| Unit | `GetStoresToCollect` uses repo value | Mock accessor in `GetStoresToCollectQueryTests` |
| Regression | Full solution build + tests | Delete of `Domain.Tests` must not break `SMCA.sln`; all tests pass with `trialMonths` rename |

## Migration / Rollout

No DB migration — seed row for `DueSoonDays` added via existing `SystemConfigurationEntityTypeConfiguration` seeding (id 4, value `"5"`), same mechanism as `PaymentGraceDays`. Deployed in the batch commit `42deff4b`.

## Open Questions

None.
