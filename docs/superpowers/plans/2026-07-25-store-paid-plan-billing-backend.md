# Store Paid-Plan Billing — Backend Implementation Plan (.NET)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-store paid-plan billing to the .NET backend: nullable plan-start, a manual "record payment" flow (super admin + reseller) that computes the reseller commission, payment-status computation, auto-downgrade of overdue stores to free (compute-on-read), plus collections and commission read queries.

**Architecture:** Pure billing math lives in a static `StoreBillingUtils` (mirrors the existing `CurrentPriceServiceUtils`). An application service `IStoreBillingService` orchestrates repositories + config + utils. Enforcement filters paid modules out of the entitlement path (`GetMeQueryHandler` and `HasUserPermissionRequirementFilter`) when a store is overdue — no destructive writes, no background job. Payments are recorded via a new `RegisterStorePaymentCommand`. Two read queries back the collections and commission views.

**Tech Stack:** .NET, MediatR (ICommand/IQuery), EF Core (Npgsql), AutoMapper, FluentValidation, xUnit + Moq + FluentAssertions (unit), `WebApplicationFactory<Program>` + real Postgres `smca_test` (E2E).

## Global Constraints

- **Money math reuses `CurrentPriceServiceUtils.GetCurrentPrice(price, percent, flat) = price − price×percent/100 − flat` (floored at 0)** — never re-derive discount math.
- **Commission = `amount − GetCurrentPrice(amount, reSellerPercent, reSellerFlat)`.**
- **Grace = `PaymentGraceDays` config (default 5). Trial = `TestingPeriodInMonths` config (default 1). Due-soon window = fixed 5 days.**
- **No debt accumulation. No background job. Enforcement is compute-on-read and reversible; never clears `PaymentStartDate`, never flips `StoreModule.IsActive`.**
- **Reseller ownership is joined via `Store.Owner.ReSellerOwner.ReSeller.UserId == <caller UserExternalId>.ToGuid()`** (the "reseller id" used app-wide is the reseller's `User.Id`).
- **Command/query house style:** `ICommand<T>`/`IQuery<T>` + handler; inject `IApplicationUnitOfWork` + repos + `IHttpContextService` + `IStringLocalizer<I18n>`; role guard `if (!(...)) throw new ApiException(_localizer["Key"], HttpStatusCode.BadRequest);`; return `ResponseResult.Success(...)`. Repos: interface in `Domain/Interfaces/Repositories`, impl in `Infrastructure/Persistence/Repositories` extending `GenericRepository<...>`, one `services.AddScoped<I,X>()` line in `Infrastructure/DependencyInjection.cs`. Persistence via `IApplicationUnitOfWork.SaveChangesAsync` (repos don't save).
- **Migrations** (run from `backend/src/`): `dotnet ef migrations add <Name> --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations`.
- **Unit test run:** `dotnet test Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~<Class>`. **E2E:** `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~<Class>` (needs Postgres `smca_test`).
- Enum values in use: `StorePaymentStatusType.Paid = 5`. New `SystemConfigurationType.PaymentGraceDays = 3`.

---

### Task 1: `PaymentGraceDays` system config

**Files:**
- Modify: `backend/src/Domain/Common/Enums/SystemConfigurationType.cs`
- Modify: `backend/src/Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs`
- Modify: `backend/src/Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs`
- Modify: `backend/src/Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs`

**Interfaces:**
- Produces: `SystemConfigurationType.PaymentGraceDays = 3`; `ISystemConfigurationRepository.GetPaymentGraceDaysAsync() : Task<int>` (default 5).

- [ ] **Step 1: Add the enum value**

In `SystemConfigurationType.cs`, after `ReSellerPercentDiscountPrice = 2,`:
```csharp
        [Description("PaymentGraceDays")]
        PaymentGraceDays = 3,
```

- [ ] **Step 2: Add the interface method**

In `ISystemConfigurationRepository.cs`, add:
```csharp
        Task<int> GetPaymentGraceDaysAsync();
```

- [ ] **Step 3: Implement the accessor + seed (no test — thin DB accessor, covered via Task 5 service tests)**

In `SystemConfigurationRepository.cs`, add (mirrors `GetTestingPeriodInMonthsAsync`):
```csharp
        public async Task<int> GetPaymentGraceDaysAsync()
        {
            SystemConfiguration? systemConfiguration = await _systemConfigurations.FirstOrDefaultAsync(conf => conf.Id == (int)SystemConfigurationType.PaymentGraceDays);
            return systemConfiguration != null ? int.Parse(systemConfiguration.Value) : 5;
        }
```
In `SystemConfigurationEntityTypeConfiguration.cs`, add another `builder.HasData(...)`:
```csharp
        builder.HasData(
            SystemConfiguration.Create((int)SystemConfigurationType.PaymentGraceDays,
            SystemConfigurationType.PaymentGraceDays.GetDisplayName(), "5"));
```

- [ ] **Step 4: Generate the migration**

Run from `backend/src/`:
```bash
dotnet ef migrations add Add-PaymentGraceDays-SystemConfig --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations
```
Expected: a migration with `InsertData` for `SystemConfiguration` id 3. Verify it builds: `dotnet build Infrastructure/Infrastructure.csproj`.

- [ ] **Step 5: Commit**
```bash
git add backend/src/Domain/Common/Enums/SystemConfigurationType.cs backend/src/Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs backend/src/Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs backend/src/Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs backend/src/Infrastructure/Migrations/
git commit -m "feat(backend): add PaymentGraceDays system config (default 5)"
```

---

### Task 2: Pure billing math — `StoreBillingUtils` (TDD core)

**Files:**
- Create: `backend/src/Domain/Common/Utils/StoreBillingUtils.cs`
- Test: `backend/src/Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs`

**Interfaces:**
- Produces:
  - `enum StoreBillingStatusType { NoAplica, AlDia, PorVencer, EnGracia, Vencido }`
  - `StoreBillingUtils.GetReSellerCommission(float amount, float percent, float flat) : float`
  - `StoreBillingUtils.GetNextDueDate(DateOnly paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate) : DateOnly`
  - `StoreBillingUtils.GetStatus(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int dueSoonDays, int graceDays) : StoreBillingStatusType`
  - `StoreBillingUtils.IsPaidPlanActive(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int graceDays) : bool`
  - `StoreBillingUtils.IsInTrial(DateOnly? paymentStartDate, int trialMonths, DateOnly today) : bool`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs`:
```csharp
using Domain.Common.Utils;
using FluentAssertions;
using Xunit;

namespace Application.Tests.Domain.Utils;

public class StoreBillingUtilsTests
{
    // ── Commission (mirrors GetCurrentPrice discount) ──────────────────────────
    [Fact]
    public void GetReSellerCommission_appliesPercentAndFlat()
    {
        // 2000 × 25% + 0 = 500
        StoreBillingUtils.GetReSellerCommission(2000f, 25f, 0f).Should().BeApproximately(500f, 0.001f);
    }

    [Fact]
    public void GetReSellerCommission_withFlat_addsFlat()
    {
        // 1000 × 20% + 50 = 250
        StoreBillingUtils.GetReSellerCommission(1000f, 20f, 50f).Should().BeApproximately(250f, 0.001f);
    }

    [Fact]
    public void GetReSellerCommission_noReseller_isZero()
    {
        StoreBillingUtils.GetReSellerCommission(1000f, 0f, 0f).Should().Be(0f);
    }

    // ── Next due date ──────────────────────────────────────────────────────────
    [Fact]
    public void GetNextDueDate_noPayments_isStartPlusTrialPlusOneMonth()
    {
        var start = new DateOnly(2026, 1, 10);
        // trial 1 + 1 post-paid month → first due ~2 months after activation
        StoreBillingUtils.GetNextDueDate(start, 1, null).Should().Be(new DateOnly(2026, 3, 10));
    }

    [Fact]
    public void GetNextDueDate_withLastPaid_usesLastPaidBeforeDate()
    {
        var start = new DateOnly(2026, 1, 10);
        var lastPaid = new DateOnly(2026, 5, 10);
        StoreBillingUtils.GetNextDueDate(start, 1, lastPaid).Should().Be(lastPaid);
    }

    // ── Status (dueSoon = 5, grace = 5) ────────────────────────────────────────
    [Theory]
    [InlineData("2026-03-04", StoreBillingStatusType.AlDia)]     // > 5 days before due
    [InlineData("2026-03-05", StoreBillingStatusType.PorVencer)] // exactly 5 days before
    [InlineData("2026-03-10", StoreBillingStatusType.PorVencer)] // due day
    [InlineData("2026-03-11", StoreBillingStatusType.EnGracia)]  // 1 day overdue
    [InlineData("2026-03-15", StoreBillingStatusType.EnGracia)]  // last grace day
    [InlineData("2026-03-16", StoreBillingStatusType.Vencido)]   // grace expired
    public void GetStatus_boundaries(string todayStr, StoreBillingStatusType expected)
    {
        var due = new DateOnly(2026, 3, 10);
        var today = DateOnly.Parse(todayStr);
        StoreBillingUtils.GetStatus(new DateOnly(2026, 1, 10), due, today, dueSoonDays: 5, graceDays: 5)
            .Should().Be(expected);
    }

    [Fact]
    public void GetStatus_noPlan_isNoAplica()
    {
        StoreBillingUtils.GetStatus(null, new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 20), 5, 5)
            .Should().Be(StoreBillingStatusType.NoAplica);
    }

    // ── IsPaidPlanActive ───────────────────────────────────────────────────────
    [Fact]
    public void IsPaidPlanActive_withinGrace_true()
    {
        StoreBillingUtils.IsPaidPlanActive(new DateOnly(2026, 1, 10), new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 15), 5)
            .Should().BeTrue();
    }

    [Fact]
    public void IsPaidPlanActive_pastGrace_false()
    {
        StoreBillingUtils.IsPaidPlanActive(new DateOnly(2026, 1, 10), new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 16), 5)
            .Should().BeFalse();
    }

    [Fact]
    public void IsPaidPlanActive_noPlan_false()
    {
        StoreBillingUtils.IsPaidPlanActive(null, new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 1), 5)
            .Should().BeFalse();
    }

    // ── IsInTrial ──────────────────────────────────────────────────────────────
    [Fact]
    public void IsInTrial_withinTrialMonth_true()
    {
        StoreBillingUtils.IsInTrial(new DateOnly(2026, 1, 10), 1, new DateOnly(2026, 2, 5)).Should().BeTrue();
    }

    [Fact]
    public void IsInTrial_afterTrial_false()
    {
        StoreBillingUtils.IsInTrial(new DateOnly(2026, 1, 10), 1, new DateOnly(2026, 2, 20)).Should().BeFalse();
    }
}
```

- [ ] **Step 2: Run — verify it fails**

Run: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~StoreBillingUtilsTests`
Expected: FAIL to compile (`StoreBillingUtils` / `StoreBillingStatusType` do not exist).

- [ ] **Step 3: Implement `StoreBillingUtils`**

Create `backend/src/Domain/Common/Utils/StoreBillingUtils.cs`:
```csharp
using System;

namespace Domain.Common.Utils
{
    public enum StoreBillingStatusType
    {
        NoAplica,
        AlDia,
        PorVencer,
        EnGracia,
        Vencido,
    }

    public static class StoreBillingUtils
    {
        /// Commission the reseller earns from an amount — the same discount shape as GetCurrentPrice.
        public static float GetReSellerCommission(float amount, float percentDiscountPrice, float discountPrice)
            => amount - CurrentPriceServiceUtils.GetCurrentPrice(amount, percentDiscountPrice, discountPrice);

        /// First due ≈ activation + trial + 1 post-paid month; afterwards the latest paid PaymentBeforeDate.
        public static DateOnly GetNextDueDate(DateOnly paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)
            => lastPaidBeforeDate ?? paymentStartDate.AddMonths(trialMonths + 1);

        public static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int dueSoonDays, int graceDays)
        {
            if (paymentStartDate is null) return StoreBillingStatusType.NoAplica;
            if (today > nextDueDate.AddDays(graceDays)) return StoreBillingStatusType.Vencido;
            if (today > nextDueDate) return StoreBillingStatusType.EnGracia;
            if (today >= nextDueDate.AddDays(-dueSoonDays)) return StoreBillingStatusType.PorVencer;
            return StoreBillingStatusType.AlDia;
        }

        public static bool IsPaidPlanActive(DateOnly? paymentStartDate, DateOnly nextDueDate, DateOnly today, int graceDays)
            => paymentStartDate is not null && today <= nextDueDate.AddDays(graceDays);

        public static bool IsInTrial(DateOnly? paymentStartDate, int trialMonths, DateOnly today)
            => paymentStartDate is not null && today <= paymentStartDate.Value.AddMonths(trialMonths);
    }
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~StoreBillingUtilsTests`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**
```bash
git add backend/src/Domain/Common/Utils/StoreBillingUtils.cs backend/src/Application.Tests/Domain/Utils/StoreBillingUtilsTests.cs
git commit -m "feat(backend): add StoreBillingUtils (commission, due date, status) with tests"
```

---

### Task 3: `Store.PaymentStartDate` → nullable + activate-on-first-paid

**Files:**
- Modify: `backend/src/Domain/Entities/Stores/Store.cs`
- Modify: `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs`
- Test: `backend/src/Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs` (new)
- Migration.

**Interfaces:**
- Produces: `Store.PaymentStartDate` is `DateOnly?`. On `UpdateStore`, when `PaymentStartDate == null` and the new `ModuleIds` include ≥1 paid module, it is set to `DateOnly.FromDateTime(DateTime.UtcNow)`. Owner-admins cannot change modules once `PaymentStartDate != null`.

- [ ] **Step 1: Make the entity field nullable**

In `Store.cs`, change:
```csharp
        public DateOnly? PaymentStartDate { get; set; } = null;
```
(Update the `Store.Create` factory + any ctor to accept `DateOnly?` and default `null`. `CreateStoreService` currently passes `today + testingPeriodInMonths`; **change it to pass `null`** — activation now happens on first paid-plan choice, not at creation. Locate `Store.Create(... paymentStartDate ...)` call in `backend/src/Application/Services/Stores/CreateStoreService.cs:42` and pass `null`.)

- [ ] **Step 2: Write the failing activation tests**

Create `backend/src/Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs`. Follow the handler-test pattern (mock `IStoreRepository`, `IStoreModuleRepository`, `IModuleRepository`, `IStoreRoleFeatureRepository`, `IApplicationUnitOfWork`, `IHttpContextService`, `IStringLocalizer<I18n>`). Two behaviors:
```csharp
[Fact]
public async Task Handle_setsPaymentStartDate_whenNullAndPaidModuleAdded()
{
    // Arrange: store with PaymentStartDate == null; request ModuleIds includes a paid module (PriceIncluded=false)
    // caller = OwnerAdmin
    // Act: handle update
    // Assert: store.PaymentStartDate is now today (DateOnly.FromDateTime(DateTime.UtcNow))
    store.PaymentStartDate.Should().Be(DateOnly.FromDateTime(DateTime.UtcNow));
}

[Fact]
public async Task Handle_ownerAdmin_cannotChangeModules_whenAlreadyActivated()
{
    // Arrange: store.PaymentStartDate != null; caller = OwnerAdmin (not super admin); request changes ModuleIds
    // Act + Assert: throws ApiException (plan locked for owner after activation)
    Func<Task> act = () => handler.Handle(request, CancellationToken.None);
    await act.Should().ThrowAsync<ApiException>();
}
```
(Fill in the arrange with the same mock-setup shape as `CreateStoreServiceTests`; assert exact behavior.)

- [ ] **Step 3: Run — verify it fails**

Run: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~UpdateStorePaymentStartDateTests`
Expected: FAIL.

- [ ] **Step 4: Implement activation + lock in `UpdateStoreCommandHandler`**

In `UpdateStoreCommand.cs` `Handle`, before applying module changes:
```csharp
bool hasPaidModuleRequested = (await _moduleRepository.GetModulesByIdsAsync(request.ModuleIds))
    .Any(m => !m.PriceIncluded);

if (!_httpContextService.IsSuperAdmin && store.PaymentStartDate is not null)
    throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest); // plan locked after activation

if (store.PaymentStartDate is null && hasPaidModuleRequested)
    store.PaymentStartDate = DateOnly.FromDateTime(DateTime.UtcNow);
```
(If `GetModulesByIdsAsync` does not exist, add it to `IModuleRepository`/`ModuleRepository` as `Task<IEnumerable<Module>> GetModulesByIdsAsync(IEnumerable<int> ids) => _modules.Where(m => ids.Contains(m.Id)).ToListAsync();`. Keep the existing SuperAdmin `PaymentStartDate` edit branch intact.)

- [ ] **Step 5: Run — verify it passes**

Run: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~UpdateStorePaymentStartDateTests`
Expected: PASS. Also run `--filter FullyQualifiedName~CreateStoreServiceTests` to confirm the `null` change didn't break creation tests (update any assertion that expected `today + trial`).

- [ ] **Step 6: Generate migration (alter column to nullable)**
```bash
dotnet ef migrations add Store-PaymentStartDate-Nullable --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations
```
Expected: `AlterColumn<DateOnly>("PaymentStartDate", "Store", nullable: true, ...)`. Build to verify.

- [ ] **Step 7: Commit**
```bash
git add backend/src/Domain/Entities/Stores/Store.cs backend/src/Application/Services/Stores/CreateStoreService.cs backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs backend/src/Domain/Interfaces/Repositories/IModuleRepository.cs backend/src/Infrastructure/Persistence/Repositories/ModuleRepository.cs backend/src/Application.Tests/Features/StoreManagement/UpdateStorePaymentStartDateTests.cs backend/src/Infrastructure/Migrations/
git commit -m "feat(backend): PaymentStartDate nullable + activate-on-first-paid, owner lock after activation"
```

---

### Task 4: `StorePayment` reseller-commission fields

**Files:**
- Modify: `backend/src/Domain/Entities/StorePayments/StorePayment.cs`
- Modify: `backend/src/Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs`
- Migration.

**Interfaces:**
- Produces: `StorePayment` gains `ReSellerId Guid?`, `ReSellerPercentDiscountPrice float`, `ReSellerDiscountPrice float`, `ReSellerAmount float`, `ByReSeller bool`; `Create(...)` factory accepts these (with `reSellerId` nullable, others defaulting 0/false).

- [ ] **Step 1: Add fields + extend the factory**

In `StorePayment.cs`, add the properties and extend the private ctor + `Create`:
```csharp
        public Guid? ReSellerId { get; set; }
        public float ReSellerPercentDiscountPrice { get; set; }
        public float ReSellerDiscountPrice { get; set; }
        public float ReSellerAmount { get; set; }
        public bool ByReSeller { get; set; }
```
```csharp
        public static StorePayment Create(Guid storeId, int storePaymentStatusId, float price, DateTimeOffset paymentBeforeDate,
            int year, int month, Guid tenantId,
            Guid? reSellerId, float reSellerPercentDiscountPrice, float reSellerDiscountPrice, float reSellerAmount, bool byReSeller)
        {
            var storePayment = new StorePayment(Guid.NewGuid(), storeId, storePaymentStatusId, price, paymentBeforeDate, year, month, tenantId);
            storePayment.ReSellerId = reSellerId;
            storePayment.ReSellerPercentDiscountPrice = reSellerPercentDiscountPrice;
            storePayment.ReSellerDiscountPrice = reSellerDiscountPrice;
            storePayment.ReSellerAmount = reSellerAmount;
            storePayment.ByReSeller = byReSeller;
            storePayment.PaidDate = DateTimeOffset.UtcNow;
            storePayment.Raise(new StorePaymentCreatedEvent(storePayment.Id));
            return storePayment;
        }
```
(`PaidDate = UtcNow` here because Task 7 records only `Paid` rows. Keep the old `Create` signature deleted or delegate — the codebase has no callers of `Create` yet, so replace it.)

- [ ] **Step 2: Configure the optional FK**

In `StorePaymentEntityTypeConfiguration.cs` `Configure`, add:
```csharp
        builder.HasOne<Domain.Entities.ReSellers.ReSeller>()
            .WithMany()
            .HasForeignKey(x => x.ReSellerId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);
        builder.HasIndex(x => x.ReSellerId);
```

- [ ] **Step 3: Generate migration**
```bash
dotnet ef migrations add StorePayment-ReSeller-Commission-Fields --project Infrastructure/Infrastructure.csproj --startup-project SMCA.WebApi/SMCA.WebApi.csproj --output-dir Migrations
```
Expected: `AddColumn` × 5 on `StorePayment`, an FK + index for `ReSellerId`. Build to verify.

- [ ] **Step 4: Commit**
```bash
git add backend/src/Domain/Entities/StorePayments/StorePayment.cs backend/src/Infrastructure/Persistence/EntityConfigurations/StorePaymentEntityTypeConfiguration.cs backend/src/Infrastructure/Migrations/
git commit -m "feat(backend): StorePayment reseller-commission fields (ReSellerId nullable, amount, ByReSeller)"
```

---

### Task 5: `IStoreBillingService` (orchestrates repos + utils)

**Files:**
- Create: `backend/src/Application/Abstractions/Billing/IStoreBillingService.cs`
- Create: `backend/src/Application/Services/Billing/StoreBillingService.cs`
- Modify: `backend/src/Domain/Interfaces/Repositories/IStorePaymentRepository.cs` + `Infrastructure/Persistence/Repositories/StorePaymentRepository.cs` (add `GetLatestPaidByStoreIdAsync`)
- Modify: `backend/src/Application/DependencyInjection.cs` (register the service)
- Test: `backend/src/Application.Tests/Services/Billing/StoreBillingServiceTests.cs`

**Interfaces:**
- Produces:
  - `record StoreBillingStatus(DateOnly? PaymentStartDate, DateOnly? NextDueDate, StoreBillingStatusType Status, bool IsInTrial, bool IsPaidPlanActive)`
  - `IStoreBillingService.GetStatusAsync(Guid storeId) : Task<StoreBillingStatus>`
  - `IStoreBillingService.IsPaidPlanActiveAsync(Guid storeId) : Task<bool>`
  - `IStorePaymentRepository.GetLatestPaidByStoreIdAsync(Guid storeId) : Task<StorePayment?>`

- [ ] **Step 1: Add the repository method (interface + impl)**

`IStorePaymentRepository.cs`:
```csharp
        Task<StorePayment?> GetLatestPaidByStoreIdAsync(Guid storeId);
```
`StorePaymentRepository.cs` (add `_storePayments = dbContext.Set<StorePayment>()` if missing, then):
```csharp
        public async Task<StorePayment?> GetLatestPaidByStoreIdAsync(Guid storeId)
            => await _storePayments
                .Where(sp => sp.StoreId == storeId && sp.StorePaymentStatusId == (int)StorePaymentStatusType.Paid)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();
```

- [ ] **Step 2: Write the failing service tests**

Create `backend/src/Application.Tests/Services/Billing/StoreBillingServiceTests.cs` (mock `IStoreRepository`, `IStorePaymentRepository`, `ISystemConfigurationRepository`):
```csharp
[Fact]
public async Task GetStatusAsync_notOnPaid_returnsNoAplica()
{
    _store.PaymentStartDate = null;
    _mockStoreRepository.Setup(x => x.GetByIdAsync(_storeId)).ReturnsAsync(_store);
    var result = await CreateService().GetStatusAsync(_storeId);
    result.Status.Should().Be(StoreBillingStatusType.NoAplica);
    result.IsPaidPlanActive.Should().BeFalse();
}

[Fact]
public async Task IsPaidPlanActiveAsync_overdue_returnsFalse()
{
    _store.PaymentStartDate = new DateOnly(2020, 1, 1); // long ago, no payments → overdue
    _mockStoreRepository.Setup(x => x.GetByIdAsync(_storeId)).ReturnsAsync(_store);
    _mockStorePaymentRepository.Setup(x => x.GetLatestPaidByStoreIdAsync(_storeId)).ReturnsAsync((StorePayment?)null);
    _mockConfig.Setup(x => x.GetTestingPeriodInMonthsAsync()).ReturnsAsync(1);
    _mockConfig.Setup(x => x.GetPaymentGraceDaysAsync()).ReturnsAsync(5);
    (await CreateService().IsPaidPlanActiveAsync(_storeId)).Should().BeFalse();
}

[Fact]
public async Task IsPaidPlanActiveAsync_recentlyActivated_returnsTrue()
{
    _store.PaymentStartDate = DateOnly.FromDateTime(DateTime.UtcNow); // trial, well within
    _mockStoreRepository.Setup(x => x.GetByIdAsync(_storeId)).ReturnsAsync(_store);
    _mockStorePaymentRepository.Setup(x => x.GetLatestPaidByStoreIdAsync(_storeId)).ReturnsAsync((StorePayment?)null);
    _mockConfig.Setup(x => x.GetTestingPeriodInMonthsAsync()).ReturnsAsync(1);
    _mockConfig.Setup(x => x.GetPaymentGraceDaysAsync()).ReturnsAsync(5);
    (await CreateService().IsPaidPlanActiveAsync(_storeId)).Should().BeTrue();
}
```

- [ ] **Step 3: Run — verify it fails.** `dotnet test ... --filter FullyQualifiedName~StoreBillingServiceTests` → FAIL (types missing).

- [ ] **Step 4: Implement the service**

`IStoreBillingService.cs`:
```csharp
using Domain.Common.Utils;

namespace Application.Abstractions.Billing
{
    public sealed record StoreBillingStatus(DateOnly? PaymentStartDate, DateOnly? NextDueDate,
        StoreBillingStatusType Status, bool IsInTrial, bool IsPaidPlanActive);

    public interface IStoreBillingService
    {
        Task<StoreBillingStatus> GetStatusAsync(Guid storeId);
        Task<bool> IsPaidPlanActiveAsync(Guid storeId);
    }
}
```
`StoreBillingService.cs`:
```csharp
using Application.Abstractions.Billing;
using Domain.Common.Utils;
using Domain.Interfaces.Repositories;

namespace Application.Services.Billing
{
    public class StoreBillingService : IStoreBillingService
    {
        private const int DueSoonDays = 5;
        private readonly IStoreRepository _storeRepository;
        private readonly IStorePaymentRepository _storePaymentRepository;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;

        public StoreBillingService(IStoreRepository storeRepository, IStorePaymentRepository storePaymentRepository,
            ISystemConfigurationRepository systemConfigurationRepository)
        {
            _storeRepository = storeRepository;
            _storePaymentRepository = storePaymentRepository;
            _systemConfigurationRepository = systemConfigurationRepository;
        }

        public async Task<StoreBillingStatus> GetStatusAsync(Guid storeId)
        {
            var store = await _storeRepository.GetByIdAsync(storeId);
            var paymentStartDate = store?.PaymentStartDate;
            if (paymentStartDate is null)
                return new StoreBillingStatus(null, null, StoreBillingStatusType.NoAplica, false, false);

            int trialMonths = await _systemConfigurationRepository.GetTestingPeriodInMonthsAsync();
            int graceDays = await _systemConfigurationRepository.GetPaymentGraceDaysAsync();
            var latestPaid = await _storePaymentRepository.GetLatestPaidByStoreIdAsync(storeId);
            DateOnly? lastPaidBefore = latestPaid is null ? null : DateOnly.FromDateTime(latestPaid.PaymentBeforeDate.UtcDateTime);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);

            var nextDue = StoreBillingUtils.GetNextDueDate(paymentStartDate.Value, trialMonths, lastPaidBefore);
            var status = StoreBillingUtils.GetStatus(paymentStartDate, nextDue, today, DueSoonDays, graceDays);
            var inTrial = StoreBillingUtils.IsInTrial(paymentStartDate, trialMonths, today);
            var active = StoreBillingUtils.IsPaidPlanActive(paymentStartDate, nextDue, today, graceDays);
            return new StoreBillingStatus(paymentStartDate, nextDue, status, inTrial, active);
        }

        public async Task<bool> IsPaidPlanActiveAsync(Guid storeId)
            => (await GetStatusAsync(storeId)).IsPaidPlanActive;
    }
}
```
Register in `Application/DependencyInjection.cs` (next to the other `AddScoped` app-service lines):
```csharp
        services.AddScoped<IStoreBillingService, StoreBillingService>();
```

- [ ] **Step 5: Run — verify it passes.** `--filter FullyQualifiedName~StoreBillingServiceTests` → PASS.

- [ ] **Step 6: Commit**
```bash
git add backend/src/Application/Abstractions/Billing/ backend/src/Application/Services/Billing/ backend/src/Domain/Interfaces/Repositories/IStorePaymentRepository.cs backend/src/Infrastructure/Persistence/Repositories/StorePaymentRepository.cs backend/src/Application/DependencyInjection.cs backend/src/Application.Tests/Services/Billing/
git commit -m "feat(backend): StoreBillingService (status, next due, is-paid-active)"
```

---

### Task 6: Enforcement + expose payment state in `GetMe`

**Files:**
- Modify: `backend/src/Application/Dtos/Authentication/CurrentUserDto.cs`
- Modify: `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`
- Modify: `backend/src/SMCA.WebApi/Filters/HasPermissionAttribute.cs`
- Test: `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` + E2E `backend/src/SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs`

**Interfaces:**
- Consumes: `IStoreBillingService` (Task 5).
- Produces: `CurrentUserDto` gains `PaymentDueDate DateOnly?`, `IsInTrial bool`, `PaymentStatus string`. Overdue store → `StoreModuleIds`/`FeatureIds` contain only free (`PriceIncluded`) modules.

- [ ] **Step 1: Extend `CurrentUserDto`**
```csharp
        public DateOnly? PaymentDueDate { get; set; }
        public bool IsInTrial { get; set; }
        public string PaymentStatus { get; set; } = StoreBillingStatusType.NoAplica.ToString();
```

- [ ] **Step 2: Write the failing unit test (overdue → only free modules + status fields)**

`GetMeOverdueDowngradeTests.cs`: mock the handler deps (including new `IStoreBillingService`). Because `IUserRepository.Where(...).IgnoreQueryFilters()` is hard to mock (documented limitation), this unit test focuses on the **filter branch**: given `_storeBillingService.IsPaidPlanActiveAsync` returns `false` and `GetAvailableModulesByStoreIdAsync` returns one free (`PriceIncluded=true`, id 20) + one paid (`PriceIncluded=false`, id 60) module, assert the resulting `StoreModuleIds` == `[20]`. (If the `Where(...)` mock proves infeasible, encode this branch as an E2E in Step 5 instead and keep the unit test on the pure filter helper.)

Extract the filter to a testable private/static helper to keep it unit-testable:
```csharp
internal static IEnumerable<Module> FilterForBilling(IEnumerable<Module> modules, bool paidPlanActive)
    => paidPlanActive ? modules : modules.Where(m => m.PriceIncluded);
```
and unit-test `FilterForBilling` directly (deterministic, no DB):
```csharp
[Fact]
public void FilterForBilling_overdue_keepsOnlyPriceIncluded()
{
    var free = Module.Create(20, "Sales", 1, true, 0f, true, true);
    var paid = Module.Create(60, "Stats", 2, false, 2000f, true, true);
    GetMeQueryHandler.FilterForBilling(new[] { free, paid }, paidPlanActive: false)
        .Select(m => m.Id).Should().BeEquivalentTo(new[] { 20 });
}
```

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Implement enforcement + status in `GetMeQueryHandler`**

Inject `IStoreBillingService _storeBillingService` (add to ctor + DI is automatic via constructor). Replace the module lines:
```csharp
            var storeModulesRaw = await _storeModuleRepositorytory.GetAvailableModulesByStoreIdAsync(user.SelectedStoreId);
            var billing = await _storeBillingService.GetStatusAsync(user.SelectedStoreId);
            var storeModules = FilterForBilling(storeModulesRaw, billing.IsPaidPlanActive);
            List<int> storeModuleIds = storeModules.Select(module => module.Id).ToList();
```
Add the `internal static` `FilterForBilling` helper to the handler class. Set the new DTO fields on the returned `CurrentUserDto`:
```csharp
                PaymentDueDate = billing.NextDueDate,
                IsInTrial = billing.IsInTrial,
                PaymentStatus = billing.Status.ToString(),
```

- [ ] **Step 5: Mirror the filter in `HasUserPermissionRequirementFilter`**

In `HasPermissionAttribute.cs`, inject `IStoreBillingService` into `HasUserPermissionRequirementFilter` and, right after `GetAvailableModulesByStoreIdAsync(...).Result`, filter when overdue (sync `.Result`, mirroring the file's existing style):
```csharp
                var paidActive = _storeBillingService.IsPaidPlanActiveAsync(_httpContextService.StoreId.ToGuid()).Result;
                var storeModules = storeModulesRaw.Where(m => paidActive || m.PriceIncluded);
```

- [ ] **Step 6: Add the E2E test**

`GetMeBillingTests.cs` (`[Collection("e2e")]`): seed a store with a paid module and `PaymentStartDate` far in the past (overdue) via `DbTestHelpers`; call `/api/v1/auth/me` (confirm the real route in `AuthController`); assert `Data.StoreModuleIds` contains only the free module id and `Data.PaymentStatus == "Vencido"`. Seed a second store recently activated → assert paid module present and `PaymentStatus == "PorVencer"`/`"AlDia"`/trial. Use the `ApiResponse<T>` envelope + try/finally cleanup pattern from `StoreGetByIdTests`.

- [ ] **Step 7: Run — unit + E2E pass.**
`dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter FullyQualifiedName~GetMeOverdueDowngradeTests`
`dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~GetMeBillingTests`

- [ ] **Step 8: Commit**
```bash
git add backend/src/Application/Dtos/Authentication/CurrentUserDto.cs backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs backend/src/SMCA.WebApi/Filters/HasPermissionAttribute.cs backend/src/Application.Tests/Authentication/Queries/GetMe/ backend/src/SMCA.WebApi.E2ETests/Billing/
git commit -m "feat(backend): enforce overdue→free entitlement + expose payment status in GetMe"
```

---

### Task 7: `RegisterStorePaymentCommand` (record a payment)

**Files:**
- Create: `backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs`
- Modify: repos — `IStoreRepository`/`StoreRepository` (`GetStoreWithModulesAndReSellerOwnerAsync`, `IsStoreOwnedByReSellerUserAsync`), `IStorePaymentRepository`/`StorePaymentRepository` (`AddAsync` inherited).
- Modify: `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` (add the endpoint).
- Test: `Application.Tests/.../RegisterStorePaymentCommandTests.cs` + E2E `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentTests.cs`.

**Interfaces:**
- Consumes: `StoreBillingUtils`, `CurrentPriceServiceUtils`, `IStoreBillingService` (for next due date), `ISystemConfigurationRepository`.
- Produces: `POST /api/v1/stores/{storeId}/payments` → creates a `Paid` `StorePayment` with amount, commission, `ByReSeller`, advancing the due date by 1 month.

- [ ] **Step 1: Repo methods**

`IStoreRepository`:
```csharp
        Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId);
        Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId);
```
`StoreRepository`:
```csharp
        public async Task<Store?> GetStoreWithModulesAndReSellerOwnerAsync(Guid storeId)
            => await _stores
                .Include(s => s.StoreModules)
                .Include(s => s.Owner).ThenInclude(o => o.ReSellerOwner)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.Id == storeId);

        public async Task<bool> IsStoreOwnedByReSellerUserAsync(Guid storeId, Guid reSellerUserId)
            => await _stores.IgnoreQueryFilters().AnyAsync(s => s.Id == storeId
                && s.Owner.ReSellerOwner != null
                && s.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId);
```

- [ ] **Step 2: Write the failing command tests**

`RegisterStorePaymentCommandTests.cs` — cover:
```csharp
[Fact] public async Task Handle_superAdmin_createsPaidPayment_withAmountAndNoCommission_whenNoReseller() { /* ReSellerId null, ReSellerAmount 0, ByReSeller false, Price = sum of paid modules */ }
[Fact] public async Task Handle_reseller_setsByReSellerTrue_andComputesCommission() { /* amount 2000, percent 25 → ReSellerAmount 500, ByReSeller true, ReSellerId set */ }
[Fact] public async Task Handle_reseller_notOwningStore_throwsApiException() { /* IsStoreOwnedByReSellerUserAsync=false → throw */ }
[Fact] public async Task Handle_storeNeverActivatedPaid_throwsApiException() { /* PaymentStartDate null → cannot pay */ }
[Fact] public async Task Handle_advancesDueDate_byOneMonth() { /* PaymentBeforeDate == nextDue.AddMonths(1) */ }
```
Assert on the `StorePayment` captured via `_mockStorePaymentRepository.Setup(x => x.AddAsync(It.IsAny<StorePayment>())).ReturnsAsync((StorePayment sp)=>sp)` + `.Callback`.

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Implement the command + handler**
```csharp
public sealed record RegisterStorePaymentCommand(Guid StoreId) : ICommand<bool> { }

public class RegisterStorePaymentCommandHandler : ICommandHandler<RegisterStorePaymentCommand, bool>
{
    private readonly IApplicationUnitOfWork _uow;
    private readonly IStoreRepository _storeRepository;
    private readonly IStorePaymentRepository _storePaymentRepository;
    private readonly ISystemConfigurationRepository _config;
    private readonly IHttpContextService _http;
    private readonly IStringLocalizer<I18n> _localizer;
    // ctor assigns all

    public async Task<ResponseResult<bool>> Handle(RegisterStorePaymentCommand request, CancellationToken ct)
    {
        bool isSuperAdmin = _http.IsSuperAdmin;
        if (!(isSuperAdmin || _http.IsReSeller))
            throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

        var store = await _storeRepository.GetStoreWithModulesAndReSellerOwnerAsync(request.StoreId)
            ?? throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        if (!isSuperAdmin && !await _storeRepository.IsStoreOwnedByReSellerUserAsync(request.StoreId, _http.UserExternalId.ToGuid()))
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

        if (store.PaymentStartDate is null)
            throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest); // never activated paid plan

        float amount = store.StoreModules
            .Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
            .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));

        var ro = store.Owner.ReSellerOwner;
        Guid? reSellerId = ro?.ReSellerId;
        float pct = ro?.PercentDiscountPrice ?? 0f;
        float flat = ro?.DiscountPrice ?? 0f;
        float commission = ro is null ? 0f : StoreBillingUtils.GetReSellerCommission(amount, pct, flat);

        int trialMonths = await _config.GetTestingPeriodInMonthsAsync();
        var latestPaid = await _storePaymentRepository.GetLatestPaidByStoreIdAsync(request.StoreId);
        DateOnly? lastPaidBefore = latestPaid is null ? null : DateOnly.FromDateTime(latestPaid.PaymentBeforeDate.UtcDateTime);
        DateOnly currentDue = StoreBillingUtils.GetNextDueDate(store.PaymentStartDate.Value, trialMonths, lastPaidBefore);
        DateOnly newDue = currentDue.AddMonths(1);

        var now = DateTime.UtcNow;
        var payment = StorePayment.Create(
            store.Id, (int)StorePaymentStatusType.Paid, amount,
            new DateTimeOffset(newDue.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            now.Year, now.Month, store.TenantId,
            reSellerId, pct, flat, commission, byReSeller: !isSuperAdmin && _http.IsReSeller);

        await _storePaymentRepository.AddAsync(payment);
        return ResponseResult.Success(await _uow.SaveChangesAsync(ct) > 0);
    }
}
```

- [ ] **Step 5: Add controller endpoint**

In `StoresController.cs`:
```csharp
        [HttpPost("{storeId}/payments")]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> RegisterStorePaymentAsync(Guid storeId)
            => Ok(await Sender.Send(new RegisterStorePaymentCommand(storeId)));
```
(Confirm `StoresController`'s class-level `[HasPermission]`; if it restricts to SuperAdmin only, put the ReSeller-inclusive attribute at the action level as above.)

- [ ] **Step 6: Run unit + write/run E2E** (`RegisterStorePaymentTests`: seed reseller+owner+store+paid module; POST as reseller; assert 200 + a `StorePayment` row exists with `ByReSeller=true`, `ReSellerAmount>0`; POST as reseller for a store it doesn't own → 400/403).

- [ ] **Step 7: Commit**
```bash
git add backend/src/Application/Features/StoreManagement/StorePayments/ backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs backend/src/Application.Tests/ backend/src/SMCA.WebApi.E2ETests/Billing/
git commit -m "feat(backend): RegisterStorePaymentCommand (super admin + reseller-scoped) with commission"
```

---

### Task 8: Collections query — stores to collect

**Files:**
- Create: `backend/src/Application/Dtos/StoreManagement/StoreToCollectDto.cs`
- Create: `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`
- Modify: `IStoreRepository`/`StoreRepository` (`GetPaidStoresAsync(bool allTenants)`, `GetPaidStoresByReSellerUserAsync(Guid reSellerUserId)` — stores with `PaymentStartDate != null` incl. owner + modules).
- Modify: `StoresController.cs` (add `GET stores/to-collect`).
- Test: unit + E2E.

**Interfaces:**
- Consumes: `IStoreBillingService.GetStatusAsync`, `CurrentPriceServiceUtils`.
- Produces: `GET /api/v1/stores/to-collect` → `List<StoreToCollectDto>` with `Status ∈ {PorVencer, EnGracia}`, scoped (super admin all; reseller own).

- [ ] **Step 1: DTO**
```csharp
public sealed class StoreToCollectDto
{
    public Guid StoreId { get; set; }
    public string StoreName { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public float Amount { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public string Status { get; set; } = "";
}
```

- [ ] **Step 2: Repo methods** (mirror `GetReSellerOwnersIncludingStoreModulesAsync` join, filter `PaymentStartDate != null`, include `Owner.User` + `StoreModules`). Super-admin variant ignores the reseller filter.

- [ ] **Step 3: Write failing query test** — given two stores (one `PorVencer`, one `AlDia`), the handler returns only the `PorVencer` one, with `Amount` = its paid-module total. Mock `IStoreBillingService.GetStatusAsync` per store id.

- [ ] **Step 4: Implement handler**
```csharp
public sealed record GetStoresToCollectQuery() : IQuery<IEnumerable<StoreToCollectDto>> { }

// handler: role guard (SuperAdmin || ReSeller); load stores (super admin all / reseller own);
// for each store: var s = await _billing.GetStatusAsync(store.Id);
//   if (s.Status is PorVencer or EnGracia) add StoreToCollectDto {
//       StoreId, StoreName=store.Name, OwnerName=store.Owner.User.FullName,
//       Amount = store.StoreModules.Where(active && !ModulePriceIncluded).Sum(GetCurrentPrice),
//       NextDueDate = s.NextDueDate, Status = s.Status.ToString() }
// return ResponseResult.Success(list.OrderBy(x => x.NextDueDate));
```

- [ ] **Step 5: Controller**
```csharp
        [HttpGet("to-collect")]
        [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.ReSellerAdmin)]
        [ProducesResponseType(typeof(ResponseResult<List<StoreToCollectDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoresToCollectAsync()
            => Ok(await Sender.Send(new GetStoresToCollectQuery()));
```

- [ ] **Step 6: Run unit + E2E; commit**
```bash
git add backend/src/Application/Dtos/StoreManagement/StoreToCollectDto.cs backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/ backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs backend/src/Application.Tests/ backend/src/SMCA.WebApi.E2ETests/Billing/
git commit -m "feat(backend): GetStoresToCollect query (due-soon/grace, scoped)"
```

---

### Task 9: Reseller commission query

**Files:**
- Create: `backend/src/Application/Dtos/StoreManagement/ReSellerCommissionDto.cs`
- Create: `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs`
- Modify: `IStorePaymentRepository`/`StorePaymentRepository` (`GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId)`, `GetAllPaidWithReSellerAsync()`).
- Modify: `StoresController.cs` or a new `StorePaymentsController` (add `GET reseller-commissions`).
- Test: unit + E2E.

**Interfaces:**
- Produces: `GET /api/v1/stores/reseller-commissions` → `List<ReSellerCommissionDto>` grouped by `Year`/`Month`, `TotalCommission = Σ ReSellerAmount`, scoped (reseller own via `ReSellerId → ReSeller.UserId`; super admin all).

- [ ] **Step 1: DTO**
```csharp
public sealed class ReSellerCommissionDto
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int PaymentCount { get; set; }
    public float TotalCommission { get; set; }
}
```

- [ ] **Step 2: Repo methods** — query `StorePayment` where `StorePaymentStatusId == Paid && ReSellerId != null` (and, for reseller scope, join `ReSeller.UserId == reSellerUserId`). Include what's needed for grouping.

- [ ] **Step 3: Failing test** — given 3 paid rows (2 in 2026-05 with commissions 500+300, 1 in 2026-06 with 200), handler returns two groups: `{2026,5, count 2, total 800}`, `{2026,6, count 1, total 200}`.

- [ ] **Step 4: Implement handler**
```csharp
public sealed record GetReSellerCommissionsQuery() : IQuery<IEnumerable<ReSellerCommissionDto>> { }
// role guard (SuperAdmin || ReSeller); load paid+reseller rows (all / scoped);
// group by (Year, Month) → ReSellerCommissionDto { Year, Month, PaymentCount = g.Count(),
//   TotalCommission = g.Sum(p => p.ReSellerAmount) }; order by Year desc, Month desc.
```

- [ ] **Step 5: Controller endpoint** (mirror Task 8's attribute).

- [ ] **Step 6: Run unit + E2E; commit**
```bash
git add backend/src/Application/Dtos/StoreManagement/ReSellerCommissionDto.cs backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/ backend/src/Domain/Interfaces/Repositories/IStorePaymentRepository.cs backend/src/Infrastructure/Persistence/Repositories/StorePaymentRepository.cs backend/src/SMCA.WebApi/Controllers/ backend/src/Application.Tests/ backend/src/SMCA.WebApi.E2ETests/Billing/
git commit -m "feat(backend): GetReSellerCommissions query (grouped by period, scoped)"
```

---

## Final validation

- [ ] Full backend build: `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` — clean.
- [ ] All unit tests: `dotnet test backend/src/Application.Tests/Application.Tests.csproj` — green.
- [ ] E2E (needs Postgres `smca_test`): `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` — green.
- [ ] Apply migrations locally: `dotnet ef database update --project backend/src/Infrastructure/Infrastructure.csproj --startup-project backend/src/SMCA.WebApi/SMCA.WebApi.csproj`.

## Notes for the frontend plan (separate)

The client consumes these NEW `GetMe` fields: `paymentDueDate` (ISO date | null), `isInTrial` (bool), `paymentStatus` (`"NoAplica"|"AlDia"|"PorVencer"|"EnGracia"|"Vencido"`). New endpoints: `POST /api/v1/stores/{storeId}/payments`, `GET /api/v1/stores/to-collect`, `GET /api/v1/stores/reseller-commissions`. `storeModuleIds` already reflects the effective (downgraded) plan.
