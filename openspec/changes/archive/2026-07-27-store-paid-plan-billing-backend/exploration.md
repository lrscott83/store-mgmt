## Exploration: store-paid-plan-billing-backend

### Current State

The codebase has billing scaffolding but everything is disconnected — no code writes/reads `StorePayment`, no enforcement, no payment lifecycle.

#### Store entity (`Domain/Entities/Stores/Store.cs`)
- `PaymentStartDate` is **non-nullable** `DateOnly` with default `DateOnly.FromDateTime(DateTime.UtcNow)`
- `Store.Create` factory accepts `DateOnly paymentStartDate` (non-nullable)
- `CreateStoreService` passes `today + TestingPeriodInMonths` → store is "activated" at creation

#### StorePayment entity (`Domain/Entities/StorePayments/StorePayment.cs`)
- Has: `StoreId`, `StorePaymentStatusId`, `PaidDate?`, `NotificationDate?`, `PaymentBeforeDate`, `Price`, `Year`, `Month`, `TenantId`
- **Missing**: `ReSellerId`, `ReSellerPercentDiscountPrice`, `ReSellerDiscountPrice`, `ReSellerAmount`, `ByReSeller`
- `Create` factory does **not** set `PaidDate` (set to `null` by default)
- No callers of `Create` exist anywhere in the codebase

#### Enums
- `StorePaymentStatusType`: `Created=1`, `Notified=2`, `Invoiced=3`, `Approved=4`, `Paid=5`
- `ModuleType.Billing = 9` — already exists
- `FeatureType.Billing = 90` — already exists
- `StoreRoleFeatures.BillingAdmin` — already exists with `[HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)] [HasFeature(FeatureType.Billing)] [HasModule(ModuleType.Billing)]`
- `SystemConfigurationType`: `TestingPeriodInMonths=1`, `ReSellerPercentDiscountPrice=2` — **missing** `PaymentGraceDays=3`

#### CurrentPriceServiceUtils (`Domain/Common/Utils/CurrentPriceServiceUtils.cs`)
- `GetCurrentPrice(price, percentDiscount, flatDiscount) = max(price - price*percent/100 - flat, 0)`
- Static class, no dependencies, pure math

#### GetMeQueryHandler (`Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`)
- Loads `storeModules` via `_storeModuleRepository.GetAvailableModulesByStoreIdAsync(user.SelectedStoreId)`
- No billing filtering — returns ALL active modules
- `CurrentUserDto` has NO payment/trial fields

#### IHttpContextService (`Application/Abstractions/HttpContext/IHttpContextService.cs`)
- Has: `IsSuperAdmin`, `IsOwnerAdmin`, `IsReSeller`, `IsSuperAdminOrOwnerAdmin`, `UserExternalId`, `StoreId`, `TenantId`

#### UpdateStoreCommandHandler (`Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs`)
- Role guard: `IsSuperAdminOrOwnerAdmin` (line 67)
- SuperAdmin can set `PaymentStartDate` directly (line 80-81)
- No activation-on-first-paid logic
- No owner lock after activation
- Command includes `PaymentStartDate` as `DateTime?` nullable already

#### SystemConfigurationRepository (`Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs`)
- Pattern: `FirstOrDefaultAsync(conf => conf.Id == (int)Type)` with fallback value
- Already has `GetTestingPeriodInMonthsAsync()` (default 1) and `GetReSellerPercentDiscountPriceAsync()` (default 20)

#### StoresController (`SMCA.WebApi/Controllers/v1/StoresController.cs`)
- Class-level `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]`
- Has endpoints: CRUD + approve/disapprove + set-my-store + by-current-user
- **Missing**: payments endpoint, to-collect endpoint, reseller-commissions endpoint
- Note: `StoresAdmin` is `[HasRoles(RoleType.OwnerAdmin)]` — but ReSeller is NOT in the class-level attribute

#### IModuleRepository (`Domain/Interfaces/Repositories/IModuleRepository.cs`)
- Has: `GetAvailableModulesToStore()`
- **Missing**: `GetModulesByIdsAsync(IEnumerable<int> ids)` — needed for activation check

#### IStorePaymentRepository (`Domain/Interfaces/Repositories/IStorePaymentRepository.cs`)
- Empty interface (only inherits `IGenericRepository<StorePayment>`)
- **Missing**: `GetLatestPaidByStoreIdAsync`

#### IStoreRepository (`Domain/Interfaces/Repositories/IStoreRepository.cs`)
- Has many methods but **missing**: `GetStoreWithModulesAndReSellerOwnerAsync`, `IsStoreOwnedByReSellerUserAsync`, `GetPaidStoresAsync`, `GetPaidStoresByReSellerUserAsync`

#### HasPermissionAttribute (`SMCA.WebApi/Filters/HasPermissionAttribute.cs`)
- `OnAuthorization` is synchronous (`.Result` calls)
- For non-superadmin, loads modules via `GetAvailableModulesByStoreIdAsync`
- No billing enforcement filter

#### Module entity (`Domain/Entities/Modules/Module.cs`)
- Has `PriceIncluded` bool — when `true`, it's a free module. When `false`, it's a paid module.
- `StoreModule` has `ModulePriceIncluded` (copy of `Module.PriceIncluded` at creation time)

#### ReSeller entities
- `ReSeller`: links to `User` (via `UserId`), has `DiscountPrice` and `PercentDiscountPrice`
- `ReSellerOwner`: links `ReSeller` to `Owner`, has its own `DiscountPrice` and `PercentDiscountPrice` (per-owner override)
- `Owner` has nullable `ReSellerOwner` navigation property
- Navigation chain: `Store.Owner.ReSellerOwner.ReSeller.UserId` → matches `_httpContextService.UserExternalId.ToGuid()`

#### Test patterns
- **CreateStoreServiceTests**: Uses mocks for all repos, `CreateService()` factory method, `SetupDefaultSuccessfulScenarios()`, fluent assertions
- **GetMeQueryHandlerTests**: Uses `TestMocks` helper class, mocks `IHttpContextService`, `IUserRepository`, etc.

#### DI registration
- Application layer: `services.AddScoped<IStoreBillingService, StoreBillingService>()` will go here
- Infrastructure layer: repos already registered individually

#### GenericRepository
- `AddAsync(TEntity entity)` — adds to context (no SaveChanges)
- `GetByIdAsync(TId id)` — `FindAsync`
- `Where(predicate)` — returns `IQueryable<TEntity>`

### Affected Areas (by task)

#### Task 1: PaymentGraceDays config
- `Domain/Common/Enums/SystemConfigurationType.cs` — add enum value
- `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` — add method
- `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` — implement
- `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs` — add seed
- `Infrastructure/Migrations/` — migration

#### Task 2: StoreBillingUtils
- Create: `Domain/Common/Utils/StoreBillingUtils.cs`
- Create: `Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs`

#### Task 3: PaymentStartDate nullable + activation
- `Domain/Entities/Stores/Store.cs` — change to `DateOnly?`, update factory/ctor
- `Application/Services/Stores/CreateStoreService.cs` — pass `null` instead of `today + trial`
- `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` — add activation + owner lock
- `Domain/Interfaces/Repositories/IModuleRepository.cs` — add `GetModulesByIdsAsync`
- `Infrastructure/Persistence/Repositories/ModuleRepository.cs` — implement
- `Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs` — new test
- `Infrastructure/Migrations/` — migration

#### Task 4: StorePayment reseller fields
- `Domain/Entities/StorePayments/StorePayment.cs` — add 5 fields, extend factory
- `Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs` — add FK + index
- `Infrastructure/Migrations/` — migration

#### Task 5: IStoreBillingService
- Create: `Application/Abstractions/Billing/IStoreBillingService.cs`
- Create: `Application/Services/Billing/StoreBillingService.cs`
- `Domain/Interfaces/Repositories/IStorePaymentRepository.cs` — add `GetLatestPaidByStoreIdAsync`
- `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` — implement
- `Application/DependencyInjection.cs` — register service
- Create: `Application.Tests/Services/Billing/StoreBillingServiceTests.cs`

#### Task 6: Enforcement + GetMe payment state
- `Application/Dtos/Authentication/CurrentUserDto.cs` — add PaymentDueDate, IsInTrial, PaymentStatus
- `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` — inject IStoreBillingService, filter paid modules, set new fields
- `SMCA.WebApi/Filters/HasPermissionAttribute.cs` — add billing filter
- `Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` — new test
- `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` — new E2E

#### Task 7: RegisterStorePaymentCommand
- Create: `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs`
- `Domain/Interfaces/Repositories/IStoreRepository.cs` — add 2 methods
- `Infrastructure/Persistence/Repositories/StoreRepository.cs` — implement
- `SMCA.WebApi/Controllers/v1/StoresController.cs` — add endpoint
- Create test files

#### Task 8: Collections query
- Create: `Application/Dtos/StoreManagement/StoreToCollectDto.cs`
- Create: `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`
- `IStoreRepository` + `StoreRepository` — add query methods
- `StoresController.cs` — add endpoint

#### Task 9: Reseller commission query
- Create: `Application/Dtos/StoreManagement/ReSellerCommissionDto.cs`
- Create: `Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs`
- `IStorePaymentRepository` + `StorePaymentRepository` — add query methods
- `StoresController.cs` — add endpoint

### Task dependency graph
```
Task 1 (PaymentGraceDays config)          Task 2 (StoreBillingUtils)
         |                                        |
         v                                        v
Task 3 (PaymentStartDate nullable)    Task 4 (StorePayment fields)
         |                                        |
         +-------------------+--------------------+
                             |
                        Task 5 (IStoreBillingService)
                             |
                   +---------+---------+
                   |                   |
              Task 6              Task 7
          (Enforcement)     (RegisterPayment)
                   |                   |
                   +---------+---------+
                             |
                   +---------+---------+
                   |                   |
              Task 8              Task 9
          (Collections)     (Commissions)
```

- Tasks 1-4 are independent (can be parallelized).
- Task 5 depends on 1, 2, and 4.
- Task 6 and 7 depend on 5.
- Tasks 8 and 9 depend on 5 + 7.

### Risks & Gotchas

1. **Nullable Reference Types**: `Store.PaymentStartDate` changing from `DateOnly` to `DateOnly?` — ensure EF config doesn't have `.IsRequired()` that conflicts.

2. **CreateStoreServiceTest breaks**: `CreateStoreAsync_ShouldSetPaymentStartDate_BasedOnTestingPeriod` asserts `PaymentStartDate == today + testingPeriod`. After change to `null`, this test fails. Must update/remove.

3. **UpdateStoreCommand.PaymentStartDate is already nullable (`DateTime?`)**: No change needed to the command record itself, only handler logic.

4. **StoresController class-level `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]`**: ReSeller is NOT in the class-level attribute. New endpoints need action-level `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]`.

5. **HasPermissionAttribute uses synchronous `.Result`**: Anti-pattern but consistent with codebase. Task 6 billing filter must follow same pattern.

6. **`GetAvailableModulesByStoreIdAsync` does NOT use `IgnoreQueryFilters`**: Enforcement filtering must happen after the method returns (in-memory filter).

7. **No existing E2E test directory**: `SMCA.WebApi.E2ETests/Billing/` needs creation.

8. **Float math**: Codebase uses `float` for all prices. Keep consistent — no `decimal`.

9. **`Owner.ReSellerOwner` is nullable**: Navigation chain `Store.Owner.ReSellerOwner.ReSeller.UserId` needs null checks throughout.

### Recommendations

1. Follow the plan order exactly — the dependency graph is clear.
2. For Task 3, distinguish SuperAdmin (can always change modules) from OwnerAdmin (locked after activation).
3. For Task 6, extract `FilterForBilling` as `internal static` helper for direct unit testability.
4. For StoresController, add action-level `[HasPermission]` for ReSeller endpoints.
5. Consider extracting an integration test for `GetAvailableModulesByStoreIdAsync` + billing filter since the IQueryable mock is complex.

### Ready for Proposal
Yes.
