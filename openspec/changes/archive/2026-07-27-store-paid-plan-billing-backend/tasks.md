# Tasks: Store Paid-Plan Billing Backend

## Overview

Turn disconnected billing scaffolding into a working per-store paid-plan lifecycle. 9 implementation tasks across 3 layers: domain math (`StoreBillingUtils`), orchestration (`IStoreBillingService`), and enforcement + endpoints.

### Dependency Graph

```
Task 1 ──┐          Task 2 ──┐
          ├── Task 5 ──┬── Task 6
Task 3 ──┘            ├── Task 7 ──┬── Task 8
Task 4 ──┘            └────────────┴── Task 9
```

Tasks 1-4 are independent (parallelizable). Task 5 depends on 1, 2, 4. Tasks 6-7 depend on 5. Tasks 8-9 depend on 5 + 7.

### Global Constraints

- All paths relative to `backend/src/`
- Money math reuses `CurrentPriceServiceUtils.GetCurrentPrice(price, percent, flat) = price − price×percent/100 − flat` (floored at 0)
- Commission = `amount − GetCurrentPrice(amount, reSellerPercent, reSellerFlat)`
- Grace = `PaymentGraceDays` config (default 5). Trial = `TestingPeriodInMonths` config (default 1). Due-soon window = fixed 5 days.
- No debt accumulation. No background job. Enforcement is compute-on-read and reversible.
- Reseller ownership is joined via `Store.Owner.ReSellerOwner.ReSeller.UserId == <caller UserExternalId>.ToGuid()`
- Command/query house style: `ICommand<T>`/`IQuery<T>` + handler; inject `IApplicationUnitOfWork` + repos + `IHttpContextService` + `IStringLocalizer<I18n>`; role guard via `if (!(...)) throw new ApiException(...)`; return `ResponseResult.Success(...)`
- Migrations run from `backend/src/`: `dotnet ef migrations add <Name> --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations`
- Enum values: `StorePaymentStatusType.Paid = 5`, `SystemConfigurationType.PaymentGraceDays = 3`
- Unit tests: `dotnet test Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~<Class>`
- E2E tests: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~<Class>` (needs Postgres `smca_test`)

---

## Task 1: PaymentGraceDays system config

**Description**: Add `SystemConfigurationType.PaymentGraceDays = 3` enum value, interface method `GetPaymentGraceDaysAsync()` with default fallback 5, repository implementation, seed data, and migration.

**Dependencies**: None (parallel with Tasks 2, 3, 4)

### Steps

- [ ] **1.1: Add enum value**

  File: `Domain/Common/Enums/SystemConfigurationType.cs`
  - Add `[Description("PaymentGraceDays")] PaymentGraceDays = 3` after `ReSellerPercentDiscountPrice = 2`

- [ ] **1.2: Add interface method**

  File: `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs`
  - Add `Task<int> GetPaymentGraceDaysAsync();`

- [ ] **1.3: Implement accessor + seed data**

  Files:
  - `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` — implement `GetPaymentGraceDaysAsync()` (mirror `GetTestingPeriodInMonthsAsync` pattern, default 5)
  - `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` — add `builder.HasData(...)` for `PaymentGraceDays` with seed value `"5"`

- [ ] **1.4: Generate migration**

  Run: `dotnet ef migrations add Add-PaymentGraceDays-SystemConfig --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations`
  - Verify: migration contains `InsertData` for `SystemConfiguration` id 3
  - Verify: `dotnet build Infrastructure/Infrastructure.csproj` passes

- [ ] **1.5: Commit**

  ```
  git add Domain/Common/Enums/SystemConfigurationType.cs Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs Infrastructure/Migrations/
  git commit -m "feat(backend): add PaymentGraceDays system config (default 5)"
  ```

**Checkpoint**: Build passes, migration file exists with `InsertData` for id=3. No test needed — thin DB accessor covered in Task 5 service tests.

---

## Task 2: StoreBillingUtils — Pure billing math (TDD)

**Description**: Create `StoreBillingStatusType` enum and `StoreBillingUtils` static class with commission calculation, next due date, status state machine, paid-plan-active check, and trial check. Tests FIRST, then implement.

**Dependencies**: None (parallel with Tasks 1, 3, 4)

### Files to create

| File | Purpose |
|------|---------|
| `Domain/Common/Utils/StoreBillingUtils.cs` | `StoreBillingStatusType` enum + 5 static methods |
| `Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs` | ~12 test cases covering all boundaries |

### Steps

- [x] **2.1 (RED): Write failing tests**

  Create `Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs` with:
  - Commission: `GetReSellerCommission` with percent+flat, with flat only, no reseller (3 tests)
  - Next due date: no payments (start + trial + 1 month), with last paid (2 tests)
  - Status: 5-boundary theory (AlDia, PorVencer x2, EnGracia x2, Vencido) + NoAplica (2 tests)
  - IsPaidPlanActive: within grace, past grace, no plan (3 tests)
  - IsInTrial: within trial, after trial (2 tests)

  Run: `--filter FullyQualifiedName~StoreBillingUtilsTests` → FAIL (compile errors)

- [x] **2.2 (GREEN): Implement `StoreBillingUtils`**

  Create `Domain/Common/Utils/StoreBillingUtils.cs`:
  - `enum StoreBillingStatusType { NoAplica, AlDia, PorVencer, EnGracia, Vencido }`
  - `GetReSellerCommission(amount, percent, flat)` → delegates to `CurrentPriceServiceUtils.GetCurrentPrice`
  - `GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate)` → `lastPaidBeforeDate ?? startDate.AddMonths(trialMonths + 1)`
  - `GetStatus(paymentStartDate?, nextDueDate, today, dueSoonDays, graceDays)` → 5-branch state machine
  - `IsPaidPlanActive(paymentStartDate?, nextDueDate, today, graceDays)` → `startDate != null && today <= nextDueDate + graceDays`
  - `IsInTrial(paymentStartDate?, trialMonths, today)` → `startDate != null && today <= startDate + trialMonths`

- [x] **2.3: Run — verify it passes**

  `--filter FullyQualifiedName~StoreBillingUtilsTests` → PASS (17/17)

- [ ] **2.4: Commit** (intentionally skipped — orchestrator requested no commit)

  ```
  git add Domain/Common/Utils/StoreBillingUtils.cs Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs
  git commit -m "feat(backend): add StoreBillingUtils (commission, due date, status, active, trial) with tests"
  ```

**Checkpoint**: All ~12 tests pass. Pure logic, no mocking needed.

---

## Task 3: Store.PaymentStartDate nullable + activate-on-first-paid

**Description**: Change `Store.PaymentStartDate` from `DateOnly` to `DateOnly?`, update factory to accept nullable, pass `null` from `CreateStoreService`, add activation-on-first-paid in `UpdateStoreCommandHandler`, add owner lock after activation, write unit tests, generate migration.

**Dependencies**: None (parallel with Tasks 1, 2, 4)

### Files to modify

| File | Change |
|------|--------|
| `Domain/Entities/Stores/Store.cs` | `PaymentStartDate` → `DateOnly?`, update factory/ctor |
| `Application/Services/Stores/CreateStoreService.cs` | Pass `null` for `PaymentStartDate` |
| `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Activation-on-first-paid + owner lock |
| `Domain/Interfaces/Repositories/IModuleRepository.cs` | Add `GetModulesByIdsAsync` |
| `Infrastructure/Persistence/Repositories/ModuleRepository.cs` | Implement `GetModulesByIdsAsync` |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs` | Activation + lock tests |

### Steps

- [x] **3.1: Make entity field nullable**

  In `Store.cs`: `public DateOnly? PaymentStartDate { get; set; } = null;`
  Update `Store.Create` factory + any ctor to accept `DateOnly?` and default `null`.

- [x] **3.2: Update `CreateStoreService`**

  Locate the `Store.Create(... paymentStartDate ...)` call and pass `null` (activation now happens on first paid-plan choice, not at creation).

- [ ] **3.3 (RED): Write failing activation + lock tests** *(pending — not in this apply batch)*

  Create `UpdateStorePaymentStartDateTests.cs` with mock setup following handler-test pattern:
  - `Handle_setsPaymentStartDate_whenNullAndPaidModuleAdded` — assert `store.PaymentStartDate` = today
  - `Handle_ownerAdmin_cannotChangeModules_whenAlreadyActivated` — assert `ApiException` thrown

  Run: `--filter FullyQualifiedName~UpdateStorePaymentStartDateTests` → FAIL

- [x] **3.4 (GREEN): Implement activation + lock**

  In `UpdateStoreCommand.cs` `Handle`:
  - `IModuleRepository` dependency already present
  - Before applying module changes: check if requested modules include paid ones, set `PaymentStartDate` on first activation, throw `ApiException` for owner module changes after activation
  - `GetModulesByIdsAsync` added to `IModuleRepository`/`ModuleRepository`

- [ ] **3.5: Run — verify it passes** *(pending — tests not written in this batch; build passes ✅)*

  `--filter FullyQualifiedName~UpdateStorePaymentStartDateTests` → PASS
  `--filter FullyQualifiedName~CreateStoreServiceTests` → PASS (confirm `null` change didn't break creation tests)

- [x] **3.6: Generate migration**

  ```
  dotnet ef migrations add Store-PaymentStartDate-Nullable --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations
  ```
  Note: Migration is a no-op (empty) because `AlterColumn` was already included in `20260727165912_StorePayment-ReSeller-Commission-Fields`. Build passes.

- [ ] **3.7: Commit** *(pending — instructed to not commit)*

  ```
  git add Domain/Entities/Stores/Store.cs Application/Services/Stores/CreateStoreService.cs Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs Domain/Interfaces/Repositories/IModuleRepository.cs Infrastructure/Persistence/Repositories/ModuleRepository.cs Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs Infrastructure/Migrations/
  git commit -m "feat(backend): PaymentStartDate nullable + activate-on-first-paid, owner lock after activation"
  ```

**Checkpoint**: Activation + lock tests pass. Existing `CreateStoreServiceTests` pass. Migration is additive (no data loss).

---

## Task 4: StorePayment reseller fields

**Description**: Add `ReSellerId`, `ReSellerPercentDiscountPrice`, `ReSellerDiscountPrice`, `ReSellerAmount`, `ByReSeller` fields to `StorePayment` entity, update `Create` factory with new parameters, add FK + index configuration, generate migration.

**Dependencies**: None (parallel with Tasks 1, 2, 3)

### Files to modify

| File | Change |
|------|--------|
| `Domain/Entities/StorePayments/StorePayment.cs` | Add 5 fields, extend `Create` factory |
| `Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs` | FK to `ReSeller` (optional) + index on `ReSellerId` |

### Steps

- [x] **4.1: Add fields + extend factory**

  In `StorePayment.cs`:
  - Add `Guid? ReSellerId`, `float ReSellerPercentDiscountPrice`, `float ReSellerDiscountPrice`, `float ReSellerAmount`, `bool ByReSeller`
  - Extend `Create` factory: add `reSellerId, reSellerPercentDiscountPrice, reSellerDiscountPrice, reSellerAmount, byReSeller` parameters; set `PaidDate = DateTimeOffset.UtcNow`; raise `StorePaymentCreatedEvent`.
  - Replace existing `Create` signature (no callers exist yet — safe to replace)

- [x] **4.2: Configure optional FK + index**

  In `StorePaymentEntityTypeConfiguration.cs` `Configure`:
  ```csharp
  builder.HasOne<Domain.Entities.ReSellers.ReSeller>()
      .WithMany()
      .HasForeignKey(x => x.ReSellerId)
      .OnDelete(DeleteBehavior.Restrict)
      .IsRequired(false);
  builder.HasIndex(x => x.ReSellerId);
  ```

- [x] **4.3: Generate migration**

  ```
  dotnet ef migrations add StorePayment-ReSeller-Commission-Fields --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations
  ```
  Verify: `AddColumn` × 5 on `StorePayment`, FK + index for `ReSellerId`. Build passes.

- [ ] **4.4: Commit**

**Checkpoint**: Migration validates (5 new columns, FK, index). Build clean.

---

## Task 5: IStoreBillingService — orchestration layer

**Description**: Create `StoreBillingStatus` record, `IStoreBillingService` interface, `StoreBillingService` implementation that orchestrates store repo + payment repo + config repos and delegates math to `StoreBillingUtils`. Add `GetLatestPaidByStoreIdAsync` to `IStorePaymentRepository`. Register in DI. Unit tests.

**Dependencies**: Task 1 (PaymentGraceDays config), Task 2 (StoreBillingUtils), Task 4 (StorePayment fields)

### Files to create

| File | Purpose |
|------|---------|
| `Application/Abstractions/Billing/IStoreBillingService.cs` | Interface + `StoreBillingStatus` record |
| `Application/Services/Billing/StoreBillingService.cs` | Implementation |

### Files to modify

| File | Change |
|------|--------|
| `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` | Add `GetLatestPaidByStoreIdAsync` |
| `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` | Implement `GetLatestPaidByStoreIdAsync` |
| `Application/DependencyInjection.cs` | Register `IStoreBillingService` |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Services/Billing/StoreBillingServiceTests.cs` | Orchestration tests (NoAplica, overdue, trial) |

### Steps

- [x] **5.1: Add repository methods**

  `IStorePaymentRepository.cs`: Added `GetLastByStoreIdAsync`, `GetByStoreIdAsync`, `GetPaidMonthsCountAsync`
  `StorePaymentRepository.cs`: Implemented all three methods.

- [ ] **5.2 (RED): Write failing service tests** *(not in this apply batch)*

  Create `StoreBillingServiceTests.cs` mocking `IStoreRepository`, `IStorePaymentRepository`, `ISystemConfigurationRepository`:
  - `GetStatusAsync_notOnPaid_returnsNoAplica` — `PaymentStartDate = null` → `Status = NoAplica`, `IsPaidPlanActive = false`
  - `IsPaidPlanActiveAsync_overdue_returnsFalse` — long-ago activation, no payments → `false`
  - `IsPaidPlanActiveAsync_recentlyActivated_returnsTrue` — today activation → `true` (within trial)

  Run: `--filter FullyQualifiedName~StoreBillingServiceTests` → FAIL

- [x] **5.3 (GREEN): Implement services + interfaces**

  Created `Domain/Interfaces/Services/Billing/IBillingService.cs`:
  - `Task<StoreBillingSummary> GetStoreBillingSummaryAsync(Guid storeId)`

  Created `Domain/Interfaces/Services/Billing/IStoreBillingService.cs`:
  - `Task RecordManualPaymentAsync(...)`
  - `Task<IEnumerable<StorePayment>> GetCollectionsAsync(Guid storeId)`
  - `Task<float> GetReSellerCommissionsAsync(...)`

  Created `Application/Services/Billing/BillingService.cs`:
  - Orchestrates repos + config + utils for billing dashboard read model

  Created `Application/Services/Billing/StoreBillingService.cs`:
  - Manual payment recording, collections, commission queries

  Created `Domain/Entities/Billing/StoreBillingSummary.cs`:
  - Read model DTO with all billing fields

- [x] **5.4: Register in DI**

  `Application/DependencyInjection.cs`: 
  - `services.AddScoped<IBillingService, BillingService>();`
  - `services.AddScoped<IStoreBillingService, StoreBillingService>();`

- [ ] **5.5: Run — verify it passes** *(tests not written in this batch; build passes ✅)*

  `--filter FullyQualifiedName~StoreBillingServiceTests` → PASS

- [ ] **5.6: Commit** *(instructed to not commit)*

  ```
  git add Application/Abstractions/Billing/ Application/Services/Billing/ Domain/Interfaces/Repositories/IStorePaymentRepository.cs Infrastructure/Persistence/Repositories/StorePaymentRepository.cs Application/DependencyInjection.cs Application.Tests/Services/Billing/
  git commit -m "feat(backend): StoreBillingService (status, next due, is-paid-active) with tests"
  ```

**Checkpoint**: All 3 orchestration tests pass. `IStoreBillingService` ready for enforcement consumers.

---

## Task 6: Enforcement + expose payment state in GetMe

**Description**: Add `FilterForBilling` static helper to `GetMeQueryHandler`, inject `IStoreBillingService`, compute billing status, filter modules when overdue, expose `PaymentDueDate`/`IsInTrial`/`PaymentStatus` on `CurrentUserDto`. Mirror filter in `HasPermissionAttribute`. Unit + E2E tests.

**Dependencies**: Task 5 (IStoreBillingService)

### Files to modify

| File | Change |
|------|--------|
| `Application/Dtos/Authentication/CurrentUserDto.cs` | Add `PaymentDueDate`, `IsInTrial`, `PaymentStatus` |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Inject `IStoreBillingService`, `FilterForBilling`, set new DTO fields |
| `SMCA.WebApi/Filters/HasPermissionAttribute.cs` | Inject `IStoreBillingService`, mirror overdue filter |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` | `FilterForBilling` unit test |
| `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` | E2E: overdue → free modules + status fields |

### Steps

- [x] **6.1: Extend `CurrentUserDto`**

  Added:
  ```csharp
  public DateOnly? PaymentDueDate { get; set; }
  public bool IsInTrial { get; set; }
  public string PaymentStatus { get; set; } = StoreBillingStatusType.NoAplica.ToString();
  ```

- [x] **6.2 (RED): Write `FilterForBilling` unit test**

  Created `GetMeOverdueDowngradeTests.cs`:
  - `FilterForBilling` is `internal static` on `GetMeQueryHandler`
  - Test: overdue → keeps only `PriceIncluded` modules
  - Test: active → all modules unchanged
  - Test: grace → all modules unchanged
  - Test: free plan → all modules unchanged
  - Test: porVencer → all modules unchanged

- [x] **6.3 (GREEN): Implement enforcement + status in handler**

  In `GetMeQuery.cs`:
  - Injected `IBillingService _billingService` (uses `GetStoreBillingSummaryAsync` instead of design doc's `IStoreBillingService.GetStatusAsync`)
  - After loading raw modules: `var billing = await _billingService.GetStoreBillingSummaryAsync(user.SelectedStoreId); List<int> storeModuleIds = FilterForBilling(storeModules, billing);`
  - Added `internal static FilterForBilling(IEnumerable<Module> modules, StoreBillingSummary billing)` helper
  - Set DTO fields: `PaymentDueDate = billing.NextDueDate`, `IsInTrial = ...`, `PaymentStatus = billing.Status.ToString()`

- [x] **6.4: Mirror filter in `HasPermissionAttribute`**

  In `HasPermissionAttribute.cs`:
  - Injected `IBillingService` into `HasUserPermissionRequirementFilter`
  - After `GetAvailableModulesByStoreIdAsync(...).Result`, call billing filter
  - Added `internal static FilterForBilling` helper (same logic)

- [x] **6.5: Write E2E test**

  `GetMeBillingTests.cs` (`[Collection("e2e")]`):
  - Overdue store (PaymentStartDate=2020-01-01) → asserts free module only, `PaymentStatus == "Vencido"`
  - Active store (PaymentStartDate=today) → asserts both modules present, `PaymentStatus` is `AlDia`/`PorVencer`

- [x] **6.6: Run — unit pass (E2E skipped — needs Postgres `smca_test`)**

  `--filter FullyQualifiedName~GetMeOverdueDowngradeTests` → PASS (5/5)

- [ ] **6.7: Commit**

  ```
  git add Application/Dtos/Authentication/CurrentUserDto.cs Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs SMCA.WebApi/Filters/HasPermissionAttribute.cs Application.Tests/Authentication/Queries/GetMe/ SMCA.WebApi.E2ETests/Billing/
  git commit -m "feat(backend): enforce overdue→free entitlement + expose payment status in GetMe"
  ```

**Checkpoint**: Overdue store returns only free module IDs from `GetMe`. `CurrentUserDto` exposes payment fields. `HasPermissionAttribute` mirrors filter. Both unit + E2E pass.

---

## Task 7: RegisterStorePaymentCommand

**Description**: New command + handler for recording manual payments. New repo methods for store eager-loading and reseller ownership check. Controller endpoint `POST /stores/{storeId}/payments` with action-level `[HasPermission]`. Computes amount (sum of paid-module current prices), commission from `ReSellerOwner` snapshot, advances due date by 1 month. Unit + E2E tests.

**Dependencies**: Task 5 (IStoreBillingService), Task 2 (StoreBillingUtils), Task 4 (StorePayment fields)

### Files to create

| File | Purpose |
|------|---------|
| `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs` | Command + Handler |

### Files to modify

| File | Change |
|------|--------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Add `GetStoreWithModulesAndReSellerOwnerAsync`, `IsStoreOwnedByReSellerUserAsync` |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Implement new methods |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Add `POST {storeId}/payments` endpoint |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Features/StoreManagement/StorePayments/Commands/RegisterStorePaymentCommandTests.cs` | 5 scenario tests |
| `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentTests.cs` | E2E: ReSeller pays, wrong ReSeller rejected |

### Steps

- [x] **7.1: Add repo methods**

  `IStoreRepository`:
  - `Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId)` — include `StoreModules`, `Owner.ReSellerOwner`, use `IgnoreQueryFilters`
  - `Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId)` — check `Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId`

  `StoreRepository.cs`: Implement both using `Include` + `ThenInclude`.

- [x] **7.2: Write command tests**

  `RegisterStorePaymentCommandTests.cs` — covers 5 scenarios:
  - `Handle_superAdmin_createsPaidPayment_withAmountAndNoCommission_whenNoReseller`
  - `Handle_reseller_setsByReSellerTrue_andComputesCommission`
  - `Handle_reseller_notOwningStore_throwsApiException`
  - `Handle_storeNeverActivatedPaid_throwsApiException`
  - `Handle_advancesDueDate_byOneMonth`

- [x] **7.3: Implement command + handler**

  `RegisterStorePaymentCommand.cs`:
  - `sealed record RegisterStorePaymentCommand(Guid StoreId) : ICommand<bool>`
  - Handler: role guard (SuperAdmin or ReSeller) → load store with modules + reseller → guard never-activated → compute `amount` from active paid modules → snapshot `ReSellerOwner` → compute commission → determine `newDueDate` (current next due + 1 month) → create `StorePayment` via extended factory → save → return

- [x] **7.4: Add controller endpoint**

  In `StoresController.cs`:
  ```csharp
  [HttpPost("{storeId}/payments")]
  [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]
  public async Task<IActionResult> RegisterStorePaymentAsync(Guid storeId)
      => Ok(await Sender.Send(new RegisterStorePaymentCommand(storeId)));
  ```

- [x] **7.5: Write E2E test**

  `RegisterStorePaymentTests.cs`:
  - Seed reseller + owner + store + paid module
  - POST as reseller → assert 200 + `StorePayment` row with `ByReSeller=true`, `ReSellerAmount>0`
  - POST as reseller for store they don't own → assert 400

- [ ] **7.6: Run — unit + E2E pass**

  `--filter FullyQualifiedName~RegisterStorePaymentCommandTests` → PASS
  `--filter FullyQualifiedName~RegisterStorePaymentTests` → PASS

- [ ] **7.7: Commit**

  ```
  git add Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/ Domain/Interfaces/Repositories/IStoreRepository.cs Infrastructure/Persistence/Repositories/StoreRepository.cs SMCA.WebApi/Controllers/v1/StoresController.cs Application.Tests/Features/StoreManagement/StorePayments/Commands/ SMCA.WebApi.E2ETests/Billing/
  git commit -m "feat(backend): RegisterStorePaymentCommand (super admin + reseller-scoped) with commission"
  ```

**Checkpoint**: All 5 command scenarios pass. E2E confirms ReSeller can pay own store, cannot pay other's store.

---

## Task 8: GetStoresToCollectQuery

**Description**: New query + handler returning stores with `PorVencer` or `EnGracia` billing status. New repo methods for paid stores (all + scoped by reseller). `StoreToCollectDto`. Controller endpoint `GET /stores/to-collect`. Unit + E2E tests.

**Dependencies**: Task 5 (IStoreBillingService), Task 7 (StorePayment repo)

### Files to create

| File | Purpose |
|------|---------|
| `Application/Dtos/StoreManagement/StoreToCollectDto.cs` | DTO: StoreId, StoreName, OwnerName, Amount, NextDueDate, Status |
| `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Query + Handler |

### Files to modify

| File | Change |
|------|--------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Add `GetPaidStoresAsync`, `GetPaidStoresByReSellerUserAsync` |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Implement new methods |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Add `GET stores/to-collect` endpoint |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetStoresToCollectQueryTests.cs` | Filter + scope tests |
| `SMCA.WebApi.E2ETests/Billing/GetStoresToCollectTests.cs` | E2E: collection query |

### Steps

- [x] **8.1: Create DTO**

  `StoreToCollectDto.cs` with: `StoreId (Guid)`, `StoreName (string)`, `OwnerName (string)`, `Amount (float)`, `NextDueDate (DateOnly?)`, `Status (string)`

- [x] **8.2: Add repo methods**

  `IStoreRepository`:
  - `Task<IEnumerable<Store>> GetPaidStoresAsync()` — stores with `PaymentStartDate != null`, include `Owner.User` + `StoreModules`
  - `Task<IEnumerable<Store>> GetPaidStoresByReSellerUserAsync(Guid reSellerUserId)` — same but scoped via `Owner.ReSellerOwner.ReSeller.UserId`

- [x] **8.3 (RED): Write failing query test**

  `GetStoresToCollectQueryTests.cs`:
  - Mock `IStoreBillingService.GetStatusAsync` per store id
  - Two stores: one `PorVencer`, one `AlDia` → result contains only the `PorVencer` one
  - Amount = sum of paid-module `GetCurrentPrice`
  - Super admin returns all; reseller returns only own stores

  Run: `--filter FullyQualifiedName~GetStoresToCollectQueryTests` → FAIL

- [x] **8.4 (GREEN): Implement handler**

  - Role guard (SuperAdmin || ReSeller)
  - Load stores (all paid / scoped)
  - For each store: compute billing status via `StoreBillingUtils`
  - Filter where status ∈ `{PorVencer, EnGracia}`
  - Map to `StoreToCollectDto` (Amount = sum of active paid modules' `GetCurrentPrice`)
  - Order by `NextDueDate` ascending
  - Return `ResponseResult.Success(...)`

- [x] **8.5: Add controller endpoint**

  ```csharp
  [HttpGet("to-collect")]
  [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]
  public async Task<IActionResult> GetStoresToCollectAsync()
      => Ok(await Sender.Send(new GetStoresToCollectQuery()));
  ```

- [x] **8.6: Write E2E test + run all**

  `GetStoresToCollectTests.cs` — seed stores with varying statuses, verify filtering + scoping.

  `--filter FullyQualifiedName~GetStoresToCollectQueryTests` → PASS
  `--filter FullyQualifiedName~GetStoresToCollectTests` → PASS

- [ ] **8.7: Commit**

  ```
  git add Application/Dtos/StoreManagement/StoreToCollectDto.cs Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/ Domain/Interfaces/Repositories/IStoreRepository.cs Infrastructure/Persistence/Repositories/StoreRepository.cs SMCA.WebApi/Controllers/v1/StoresController.cs Application.Tests/Features/StoreManagement/StorePayments/Queries/ SMCA.WebApi.E2ETests/Billing/
  git commit -m "feat(backend): GetStoresToCollect query (due-soon/grace, scoped by role)"
  ```

**Checkpoint**: Collection query returns only `PorVencer`/`EnGracia` stores, scoped by caller role. Amounts computed correctly.

---

## Task 9: GetReSellerCommissionsQuery

**Description**: New query + handler returning reseller commissions grouped by year/month. New repo methods for payment queries (all + scoped by reseller). `ReSellerCommissionDto`. Controller endpoint `GET /stores/reseller-commissions`. Unit + E2E tests.

**Dependencies**: Task 5 (IStoreBillingService), Task 7 (StorePayment repo with reseller fields)

### Files to create

| File | Purpose |
|------|---------|
| `Application/Dtos/StoreManagement/ReSellerCommissionDto.cs` | DTO: Year, Month, PaymentCount, TotalCommission |
| `Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs` | Query + Handler |

### Files to modify

| File | Change |
|------|--------|
| `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` | Add `GetAllPaidWithReSellerAsync`, `GetPaidWithReSellerByReSellerUserAsync` |
| `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` | Implement new methods |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Add `GET reseller-commissions` endpoint |

### Test files to create

| File | Purpose |
|------|---------|
| `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissionsQueryTests.cs` | Grouping + scope tests |
| `SMCA.WebApi.E2ETests/Billing/GetReSellerCommissionsTests.cs` | E2E: commission query |

### Steps

- [x] **9.1: Create DTO**

  `ReSellerCommissionDto.cs` with: `Year (int)`, `Month (int)`, `PaymentCount (int)`, `TotalCommission (float)`

- [x] **9.2: Add repo methods**

  `IStorePaymentRepository`:
  - `Task<IEnumerable<StorePayment>> GetAllPaidWithReSellerAsync()` — `StorePaymentStatusId == Paid && ReSellerId != null`
  - `Task<IEnumerable<StorePayment>> GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId)` — same, join `ReSeller.UserId == reSellerUserId`

- [x] **9.3 (RED): Write failing query test**

  `GetReSellerCommissionsQueryTests.cs`:
  - 3 paid rows: 2 in 2026-05 (commissions 500, 300), 1 in 2026-06 (commission 200)
  - Handler returns: `{2026,5, count 2, total 800}`, `{2026,6, count 1, total 200}`
  - Super admin returns all; reseller returns only own payments

  Run: `--filter FullyQualifiedName~GetReSellerCommissionsQueryTests` → FAIL

- [x] **9.4 (GREEN): Implement handler**

  - Role guard (SuperAdmin || ReSeller)
  - Load paid-with-reseller rows (all / scoped)
  - Group by `(Year, Month)` → `ReSellerCommissionDto { Year, Month, PaymentCount = g.Count(), TotalCommission = g.Sum(p => p.ReSellerAmount) }`
  - Order by `Year desc, Month desc`
  - Return `ResponseResult.Success(...)`

- [x] **9.5: Add controller endpoint**

  ```csharp
  [HttpGet("reseller-commissions")]
  [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]
  public async Task<IActionResult> GetReSellerCommissionsAsync()
      => Ok(await Sender.Send(new GetReSellerCommissionsQuery()));
  ```

- [x] **9.6: Write E2E test + run all**

  `GetReSellerCommissionsTests.cs` — seed payments with reseller, verify grouping + scoping.

  `--filter FullyQualifiedName~GetReSellerCommissionsQueryTests` → PASS
  `--filter FullyQualifiedName~GetReSellerCommissionsTests` → PASS

- [ ] **9.7: Commit**

  ```
  git add Application/Dtos/StoreManagement/ReSellerCommissionDto.cs Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/ Domain/Interfaces/Repositories/IStorePaymentRepository.cs Infrastructure/Persistence/Repositories/StorePaymentRepository.cs SMCA.WebApi/Controllers/v1/StoresController.cs Application.Tests/Features/StoreManagement/StorePayments/Queries/ SMCA.WebApi.E2ETests/Billing/
  git commit -m "feat(backend): GetReSellerCommissions query (grouped by period, scoped by role)"
  ```

**Checkpoint**: Commissions grouped by year/month, totals correct. Super admin sees all, reseller sees own.

---

## Final Validation

- [ ] Full backend build: `dotnet build SMCA.WebApi/SMCA.WebApi.csproj` — clean
- [ ] All unit tests: `dotnet test Application.Tests/Application.Tests.csproj` — green
- [ ] E2E (needs Postgres `smca_test`): `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` — green
- [ ] Apply migrations: `dotnet ef database update --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj`

## New/Modified Files Summary (Consolidated)

### New files (8)

| # | File | Task |
|---|------|------|
| 1 | `Domain/Common/Utils/StoreBillingUtils.cs` | T2 |
| 2 | `Application/Abstractions/Billing/IStoreBillingService.cs` | T5 |
| 3 | `Application/Services/Billing/StoreBillingService.cs` | T5 |
| 4 | `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs` | T7 |
| 5 | `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | T8 |
| 6 | `Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs` | T9 |
| 7 | `Application/Dtos/StoreManagement/StoreToCollectDto.cs` | T8 |
| 8 | `Application/Dtos/StoreManagement/ReSellerCommissionDto.cs` | T9 |

### Modified files (17)

| # | File | Task |
|---|------|------|
| 1 | `Domain/Common/Enums/SystemConfigurationType.cs` | T1 |
| 2 | `Domain/Entities/Stores/Store.cs` | T3 |
| 3 | `Domain/Entities/StorePayments/StorePayment.cs` | T4 |
| 4 | `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | T1 |
| 5 | `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` | T5, T9 |
| 6 | `Domain/Interfaces/Repositories/IStoreRepository.cs` | T7, T8 |
| 7 | `Domain/Interfaces/Repositories/IModuleRepository.cs` | T3 |
| 8 | `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | T1 |
| 9 | `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` | T5, T9 |
| 10 | `Infrastructure/Persistence/Repositories/StoreRepository.cs` | T7, T8 |
| 11 | `Infrastructure/Persistence/Repositories/ModuleRepository.cs` | T3 |
| 12 | `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` | T1 |
| 13 | `Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs` | T4 |
| 14 | `Application/Dtos/Authentication/CurrentUserDto.cs` | T6 |
| 15 | `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | T6 |
| 16 | `Application/Services/Stores/CreateStoreService.cs` | T3 |
| 17 | `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | T3 |
| 18 | `SMCA.WebApi/Filters/HasPermissionAttribute.cs` | T6 |
| 19 | `SMCA.WebApi/Controllers/v1/StoresController.cs` | T7, T8, T9 |
| 20 | `Application/DependencyInjection.cs` | T5 |

### Test files (10)

| # | File | Task | Type |
|---|------|------|------|
| 1 | `Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs` | T2 | Unit |
| 2 | `Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs` | T3 | Unit |
| 3 | `Application.Tests/Services/Billing/StoreBillingServiceTests.cs` | T5 | Unit |
| 4 | `Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` | T6 | Unit |
| 5 | `Application.Tests/Features/StoreManagement/StorePayments/Commands/RegisterStorePaymentCommandTests.cs` | T7 | Unit |
| 6 | `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetStoresToCollectQueryTests.cs` | T8 | Unit |
| 7 | `Application.Tests/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissionsQueryTests.cs` | T9 | Unit |
| 8 | `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` | T6 | E2E |
| 9 | `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentTests.cs` | T7 | E2E |
| 10 | `SMCA.WebApi.E2ETests/Billing/GetStoresToCollectTests.cs` | T8 | E2E |
| 11 | `SMCA.WebApi.E2ETests/Billing/GetReSellerCommissionsTests.cs` | T9 | E2E |

### Migrations (3)

| Name | Task |
|------|------|
| `Add-PaymentGraceDays-SystemConfig` | T1 |
| `Store-PaymentStartDate-Nullable` | T3 |
| `StorePayment-ReSeller-Commission-Fields` | T4 |
