# Tasks: fix-store-seed-payment-start-date

## Phase 1: DTO Contract — Make PaymentStartDate Nullable

- [ ] 1.1 `Application/Dtos/StoreManagement/StoreDto.cs` — `DateOnly PaymentStartDate` → `DateOnly?` (line 16)
- [ ] 1.2 `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` — `DateOnly PaymentStartDate` → `DateOnly?` in `StoreData` (line 23)
- [ ] 1.3 Verify: `dotnet build backend/src/Application/Application.csproj`

## Phase 2: E2E Seed — Drop Explicit paymentStartDate Args

- [ ] 2.1 `StoreSeed.cs` — Remove 5th arg `DateOnly.FromDateTime(DateTime.UtcNow)` from `Store.Create()` in `SeedStoreAsync` (line ~45)
- [ ] 2.2 `StoreSeed.cs` — Same removal in `SeedStoresAdminUserAsync` (line ~64)
- [ ] 2.3 `StoreSeed.cs` — Same removal in `SeedStoreInNewTenantAsync` (line ~86)
- [ ] 2.4 Verify: `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`

## Phase 3: E2E Assertion — Expect Null for Free Store

- [ ] 3.1 `StoreGetByIdTests.cs` (line 20, 32) — Change `.Be(today)` → `.BeNull()`, remove unused `today` variable
- [ ] 3.2 Verify: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "StoreGetByIdTests"` → PASS

## Phase 4: Full Regression

- [ ] 4.1 Run: `dotnet test backend/src/SMCA.sln` → ALL PASS

### Implementation Order

| Dependency | Why |
|---|---|
| Phase 1 → Phase 2 | DTO must compile first; seed changes depend on `StoreDto` nullability |
| Phase 2 → Phase 3 | Seed must produce null `PaymentStartDate`, then assert it |
| Phase 3 → Phase 4 | Single test must pass before full regression |

### Verify Commands

```powershell
# Task 1.3
dotnet build backend/src/Application/Application.csproj

# Task 2.4
dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj

# Task 3.2
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "StoreGetByIdTests"

# Task 4.1
dotnet test backend/src/SMCA.sln
```
