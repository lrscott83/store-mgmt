# Tasks: fix-istrial-duplicate

## Phase 1: Foundation

- [ ] 1.1 Add `public bool IsInTrial { get; init; }` to `Domain/Entities/Billing/StoreBillingSummary.cs`
      Verify: `dotnet build backend/src/Domain/Domain.csproj`

## Phase 2: Core Implementation

- [ ] 2.1 Compute `IsInTrial` in `Application/Services/Billing/BillingService.cs` via `StoreBillingUtils.IsInTrial(store.PaymentStartDate, trialMonths, today)` and assign to summary
      Verify: `dotnet build backend/src/Application/Application.csproj`

- [ ] 2.2 Replace inline `IsInTrial = billing.PaymentStartDate is not null && billing.PaymentStartDate.Value.AddMonths(1) >= today` with `IsInTrial = billing.IsInTrial` in `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` (line 99)
      Verify: `dotnet build backend/src/Application/Application.csproj`

## Phase 3: Testing

- [ ] 3.1 Add `.Be(false)` for `isInTrial` in `Me_freeStore_returnsNoAplica` test (free store → S1)
- [ ] 3.2 Add `.Be(true)` for `isInTrial` in `Me_PorVencer_returnsStatus` test (within trial → S2)
- [ ] 3.3 Add `.Be(false)` for `isInTrial` in `Me_EnGracia_returnsStatus` test (past trial → S3)
      Verify: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "GetMeBilling"` → PASS

- [ ] 3.4 Full regression: `dotnet test backend/src/SMCA.sln` → ALL PASS
