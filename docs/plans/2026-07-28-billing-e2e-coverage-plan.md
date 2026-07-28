# Billing Coverage and Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two defects the billing test gap was hiding — the missing data backfill for `Store.PaymentStartDate` and the unrepresentable `DateOnly.MaxValue` substitution — and then build the full four-category test suite for each of the four new billing endpoints.

**Architecture:** `null` is the domain model for "the billing clock never started". Every fix pushes toward making the type system say that, instead of substituting magic dates. Calendar arithmetic is tested at the unit level (`Application.Tests`); wiring, roles and persistence at the end-to-end level (`SMCA.WebApi.E2ETests`).

**Tech Stack:** .NET 8, EF Core with PostgreSQL, xUnit 2.4, FluentAssertions 6.12, Moq 4.20, FluentValidation, `WebApplicationFactory<Program>` for end-to-end tests.

**Spec:** `docs/plans/2026-07-28-billing-e2e-coverage-design.md`

## Global Constraints

- All code, identifiers, comments and commit messages in English.
- Commit messages follow Conventional Commits. Never add AI-attribution trailers.
- **The user runs every git command.** Commit steps list the exact command; do not execute it.
- Working directory for all commands: `backend/src` (where `SMCA.sln` lives).
- End-to-end tests need PostgreSQL on `localhost:5432` with user `postgres` / password `postgres`. `WebAppFixture` creates and migrates `smca_test` on first run.
- All end-to-end test classes carry `[Collection("e2e")]`. The collection runs serially against one shared factory and one database.
- Every end-to-end test cleans up what it seeds in a `finally` block. Follow the cleanup order used by existing tests: payments → store modules → stores → reseller owners → owners → resellers → user roles → users.
- Existing test naming: `Subject_condition_expectedOutcome`.
- **Authorization outcomes are exact, never `BeOneOf`.** `HasUserPermissionRequirementFilter` returns `UnauthorizedResult` (**401**) when there is no `UserExternalId`, and `ForbidResult` (**403**) when a non-SuperAdmin lacks the required feature. SuperAdmin skips every check. Only a ReSeller that passes the filter but does not own the target store reaches the handler guard and gets **400**. `StorePaymentAdmin` is declared `[HasRoles(SuperAdmin, ReSeller)]`, so an OwnerAdmin can never hold it.
- **Assert error codes only where the pipeline produces them.** `ErrorHandlerMiddleware` fills `ApiResponse.Errors` for `ValidationException` (the FluentValidation pipeline) but **not** for `ApiException`, which is what the handler role and state guards throw. For handler-guard rejections assert the status, `Succeeded == false` and `Errors` empty; asserting a field code there always fails.
- Every test whose outcome depends on the date pins the clock through `WebAppFixture.Clock`. A date-dependent test that reads the real clock fails on a different day of the month.
- Seeded test module ids: `7` = Management (`PriceIncluded = true`, free), `6` = Statistics (`PriceIncluded = false`, paid).
- Seeded `SystemConfiguration`: `TestingPeriodInMonths = 1`, `PaymentGraceDays = 5`. The due-soon window is hard-coded to 5 days in application code.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `Application.Tests/Services/Billing/BillingServiceTests.cs` | Unit tests for the only billing class with no coverage |
| `Application/Abstractions/Time/IDateTimeProvider.cs` | Clock abstraction, relocated from Infrastructure |
| `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommandValidator.cs` | Missing validator |
| `Infrastructure/Migrations/<timestamp>_Backfill-PaymentStartDate-Null.cs` | Data backfill migration |
| `Infrastructure/Migrations/PaymentStartDateBackfill.cs` | Shared SQL constant used by migration and test |
| `backend/scripts/06-20260728-Backfill-PaymentStartDate.sql` | Deployment script matching the migration |
| `SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs` | Test clock |
| `SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs` | Intent-revealing billing seeds |
| `SMCA.WebApi.E2ETests/Billing/BackfillMigrationTests.cs` | Verifies the backfill SQL |
| `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentValidationTests.cs` | Validator coverage |
| `SMCA.WebApi.E2ETests/Billing/StoreActivationOnFirstPaidTests.cs` | Activation-on-first-paid through HTTP |
| `SMCA.WebApi.E2ETests/Billing/SetPaymentDate{HappyPath,EdgeCase,ErrorHandling,Integration}Tests.cs` | The four-category suite for `PUT /stores/{id}/payment-date` |
| `SMCA.WebApi.E2ETests/Billing/RegisterPayment{HappyPath,EdgeCase,ErrorHandling,Integration}Tests.cs` | The four-category suite for `POST /stores/{id}/payments` |
| `SMCA.WebApi.E2ETests/Billing/ToCollect{HappyPath,EdgeCase,ErrorHandling,Integration}Tests.cs` | The four-category suite for `GET /stores/to-collect` |
| `SMCA.WebApi.E2ETests/Billing/ResellerCommissions{HappyPath,EdgeCase,ErrorHandling,Integration}Tests.cs` | The four-category suite for `GET /stores/reseller-commissions` |

Every new test for the four new endpoints lives in a category file. The pre-existing `RegisterStorePaymentTests.cs`, `GetStoresToCollectTests.cs` and `GetReSellerCommissionsTests.cs` keep the tests they already hold and are never modified, so the naming stays predictable: one endpoint, four files, one category each.

**Modified:**

| File | Change |
|---|---|
| `Domain/Common/Utils/StoreBillingUtils.cs` | `GetNextDueDate` and `GetStatus` become nullable-aware |
| `Domain/Entities/Billing/StoreBillingSummary.cs` | `NextDueDate` becomes `DateOnly?` |
| `Application/Services/Billing/BillingService.cs` | Drop `?? DateOnly.MaxValue`; inject the clock |
| `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs` | Drop `?? DateOnly.MaxValue`; inject the clock |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Inject the clock |
| `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Inject the clock |
| `SMCA.WebApi/Services/DateTimeProvider.cs`, `WebApiTest/Services/DateTimeProvider.cs` | Update `using` |
| `SMCA.WebApi/Program.cs`, `WebApiTest/Program.cs` | Update `using` |
| `Application/DependencyInjection.cs` | Remove the `IStoreBillingService` registration |
| `Application.Tests/DomainUtils/StoreBillingUtilsTests.cs` | Three new cases |
| `SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs` | Register the test clock |
| `SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs` | Expose `Clock` |
| `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` | Free-store, `PorVencer`, `EnGracia`, trial cases |
| `SMCA.WebApi.E2ETests/Features/FeaturesActivateTests.cs` | Statistics price assertion |

**Deleted:**

| File | Reason |
|---|---|
| `Application/Services/Billing/StoreBillingService.cs` | Dead code duplicating `RegisterStorePaymentCommandHandler` |
| `Domain/Interfaces/Services/Billing/IStoreBillingService.cs` | Interface of the deleted class |

---

# PR 1 — Fixes, clock, migration (Tasks 1–7)

## Task 1: Make the billing clock arithmetic null-safe

The defect: `BillingService` and `GetStoresToCollectQueryHandler` pass
`store.PaymentStartDate ?? DateOnly.MaxValue` into `GetNextDueDate`, which calls
`AddMonths` on it. `DateOnly.AddMonths` throws `ArgumentOutOfRangeException` when the
result leaves the representable range. `BillingService` has no test file at all.

**Files:**
- Test: `Application.Tests/Services/Billing/BillingServiceTests.cs` (create)
- Test: `Application.Tests/DomainUtils/StoreBillingUtilsTests.cs` (modify)
- Modify: `Domain/Common/Utils/StoreBillingUtils.cs`
- Modify: `Domain/Entities/Billing/StoreBillingSummary.cs`
- Modify: `Application/Services/Billing/BillingService.cs`
- Modify: `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `StoreBillingUtils.GetNextDueDate(DateOnly? paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate) → DateOnly?` and `StoreBillingUtils.GetStatus(DateOnly? paymentStartDate, DateOnly? nextDueDate, DateOnly today, int dueSoonDays, int graceDays) → StoreBillingStatusType`. `StoreBillingSummary.NextDueDate` becomes `DateOnly?`. Tasks 3, 4, 8 and 12 rely on these.

- [ ] **Step 1: Write the failing unit tests for `BillingService`**

Create `Application.Tests/Services/Billing/BillingServiceTests.cs`:

```csharp
using Application.Services.Billing;
using Domain.Common.Enums;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Services.Billing;

public class BillingServiceTests
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStorePaymentRepository> _paymentRepository = new();
    private readonly Mock<IModuleRepository> _moduleRepository = new();
    private readonly Mock<ISystemConfigurationRepository> _configRepository = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();

    private BillingService CreateSut() => new(
        _storeRepository.Object,
        _paymentRepository.Object,
        _moduleRepository.Object,
        _configRepository.Object);

    private Store ArrangeStore(Guid storeId, DateOnly? paymentStartDate, params StoreModule[] modules)
    {
        var store = Store.Create("Test Store", _ownerId, approved: true, _tenantId, paymentStartDate);
        store.StoreModules = modules.ToList();
        _storeRepository.Setup(r => r.GetByIdAsync(storeId)).ReturnsAsync(store);
        _paymentRepository.Setup(r => r.GetPaidMonthsCountAsync(storeId)).ReturnsAsync(0);
        _paymentRepository.Setup(r => r.GetLastByStoreIdAsync(storeId)).ReturnsAsync((StorePayment?)null);
        _configRepository.Setup(r => r.GetTestingPeriodInMonthsAsync()).ReturnsAsync(1);
        _configRepository.Setup(r => r.GetPaymentGraceDaysAsync()).ReturnsAsync(5);
        _moduleRepository.Setup(r => r.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<Module>());
        return store;
    }

    private static StoreModule PaidModule(Guid storeId, Guid tenantId, float price)
        => StoreModule.Create(storeId, 6, price, modulePriceIncluded: false,
            modulePrice: price, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId);

    [Fact]
    public async Task GetStoreBillingSummary_freeStore_returnsNoAplica_andDoesNotThrow()
    {
        var storeId = Guid.NewGuid();
        ArrangeStore(storeId, paymentStartDate: null);

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.Status.Should().Be(StoreBillingStatusType.NoAplica);
        summary.NextDueDate.Should().BeNull();
        summary.PlanType.Should().Be("Free");
    }

    [Fact]
    public async Task GetStoreBillingSummary_unknownStore_returnsNoAplica()
    {
        var storeId = Guid.NewGuid();
        _storeRepository.Setup(r => r.GetByIdAsync(storeId)).ReturnsAsync((Store?)null!);

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.Status.Should().Be(StoreBillingStatusType.NoAplica);
        summary.StoreId.Should().Be(storeId);
    }

    [Fact]
    public async Task GetStoreBillingSummary_paidStoreWithoutPayments_amountIsSumOfPaidModules()
    {
        var storeId = Guid.NewGuid();
        var start = DateOnly.FromDateTime(DateTime.UtcNow);
        ArrangeStore(storeId, start, PaidModule(storeId, _tenantId, 1000f));
        _moduleRepository.Setup(r => r.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<Module> { ModuleWithPrice(1000f) });

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.PlanType.Should().Be("Paid");
        summary.CurrentMonthAmount.Should().BeApproximately(1000f, 0.001f);
        summary.NextDueDate.Should().Be(start.AddMonths(2));
    }

    [Fact]
    public async Task GetStoreBillingSummary_withLastPayment_usesItsPrice_asCurrentAmount()
    {
        var storeId = Guid.NewGuid();
        var start = new DateOnly(2026, 1, 10);
        ArrangeStore(storeId, start, PaidModule(storeId, _tenantId, 1000f));
        _moduleRepository.Setup(r => r.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<Module> { ModuleWithPrice(1000f) });
        _paymentRepository.Setup(r => r.GetLastByStoreIdAsync(storeId)).ReturnsAsync(
            StorePayment.Create(storeId, (int)StorePaymentStatusType.Paid, price: 750f,
                paymentBeforeDate: new DateTimeOffset(2026, 4, 10, 0, 0, 0, TimeSpan.Zero),
                year: 2026, month: 4, tenantId: _tenantId, reSellerId: null,
                reSellerPercentDiscountPrice: 0, reSellerDiscountPrice: 0,
                reSellerAmount: 0, byReSeller: false));

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.CurrentMonthAmount.Should().BeApproximately(750f, 0.001f);
        summary.NextDueDate.Should().Be(new DateOnly(2026, 4, 10));
        summary.ReSellerCommission.Should().Be(0f);
    }

    [Fact]
    public async Task GetStoreBillingSummary_lastPaymentByReSeller_reportsCommission()
    {
        var storeId = Guid.NewGuid();
        ArrangeStore(storeId, new DateOnly(2026, 1, 10), PaidModule(storeId, _tenantId, 1000f));
        _moduleRepository.Setup(r => r.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<Module> { ModuleWithPrice(1000f) });
        _paymentRepository.Setup(r => r.GetLastByStoreIdAsync(storeId)).ReturnsAsync(
            StorePayment.Create(storeId, (int)StorePaymentStatusType.Paid, price: 1000f,
                paymentBeforeDate: new DateTimeOffset(2026, 4, 10, 0, 0, 0, TimeSpan.Zero),
                year: 2026, month: 4, tenantId: _tenantId, reSellerId: Guid.NewGuid(),
                reSellerPercentDiscountPrice: 15f, reSellerDiscountPrice: 0,
                reSellerAmount: 150f, byReSeller: true));

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        // 1000 × 15% + 0 = 150
        summary.ReSellerCommission.Should().BeApproximately(150f, 0.001f);
    }

    [Fact]
    public async Task GetStoreBillingSummary_monthsActive_isNeverNegative()
    {
        var storeId = Guid.NewGuid();
        var futureStart = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(3);
        ArrangeStore(storeId, futureStart);

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.MonthsActive.Should().BeGreaterThanOrEqualTo(0);
    }

    private static Module ModuleWithPrice(float price)
    {
        var module = new Module { Id = 6, Price = price, PriceIncluded = false };
        return module;
    }
}
```

If `Module` has no public parameterless constructor or settable `Id`/`Price`/`PriceIncluded`,
replace `ModuleWithPrice` with the factory the entity exposes — check
`Domain/Entities/Modules/Module.cs` and mirror how `Application.Tests` seeds modules in
`Features/Administration/Features/Queries/GetAvailableFeaturesToStore/GetAvailableFeaturesToStoreQueryHandlerTests.cs`.

- [ ] **Step 2: Add the three missing `StoreBillingUtils` cases**

Append to `Application.Tests/DomainUtils/StoreBillingUtilsTests.cs`, inside the class:

```csharp
        [Fact]
        public void GetNextDueDate_noStartDate_isNull()
        {
            StoreBillingUtils.GetNextDueDate(null, 1, null).Should().BeNull();
        }

        [Fact]
        public void GetStatus_noDueDate_isNoAplica()
        {
            StoreBillingUtils.GetStatus(null, null, new DateOnly(2026, 3, 20), 5, 5)
                .Should().Be(StoreBillingStatusType.NoAplica);
        }

        [Fact]
        public void GetNextDueDate_monthEndStart_clampsToShorterMonth()
        {
            // 31 January + (trial 0 + 1) month → February has no 31st
            StoreBillingUtils.GetNextDueDate(new DateOnly(2026, 1, 31), 0, null)
                .Should().Be(new DateOnly(2026, 2, 28));
        }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~BillingServiceTests|FullyQualifiedName~StoreBillingUtilsTests"`

Expected: compile errors on `GetNextDueDate(null, ...)` and `summary.NextDueDate.Should().BeNull()` (the parameter and property are not nullable yet). Fix the production signatures in Step 4, then the `freeStore` test is expected to fail with `ArgumentOutOfRangeException` until Step 5 — that failure is the confirmation of F2. Record the actual exception in the commit body.

- [ ] **Step 4: Make `StoreBillingUtils` nullable-aware**

In `Domain/Common/Utils/StoreBillingUtils.cs`, replace `GetNextDueDate` and `GetStatus`:

```csharp
        /// First due ≈ activation + trial + 1 post-paid month; afterwards the latest paid PaymentBeforeDate.
        /// Null start date means the billing clock never started, so there is no due date.
        public static DateOnly? GetNextDueDate(DateOnly? paymentStartDate, int trialMonths, DateOnly? lastPaidBeforeDate)
        {
            if (lastPaidBeforeDate is not null) return lastPaidBeforeDate;
            if (paymentStartDate is null) return null;
            return paymentStartDate.Value.AddMonths(trialMonths + 1);
        }

        public static StoreBillingStatusType GetStatus(DateOnly? paymentStartDate, DateOnly? nextDueDate, DateOnly today, int dueSoonDays, int graceDays)
        {
            if (paymentStartDate is null || nextDueDate is null) return StoreBillingStatusType.NoAplica;

            DateOnly due = nextDueDate.Value;
            if (today > due.AddDays(graceDays)) return StoreBillingStatusType.Vencido;
            if (today > due) return StoreBillingStatusType.EnGracia;
            if (today >= due.AddDays(-dueSoonDays)) return StoreBillingStatusType.PorVencer;
            return StoreBillingStatusType.AlDia;
        }
```

Leave `IsPaidPlanActive` and `IsInTrial` unchanged.

In `Domain/Entities/Billing/StoreBillingSummary.cs`, change one line:

```csharp
    public DateOnly? NextDueDate { get; init; }
```

- [ ] **Step 5: Remove the `DateOnly.MaxValue` substitutions**

In `Application/Services/Billing/BillingService.cs`, replace the `nextDueDate` assignment:

```csharp
        var nextDueDate = StoreBillingUtils.GetNextDueDate(
            store.PaymentStartDate,
            trialMonths,
            lastPayment?.PaymentBeforeDate is DateTimeOffset pbd ? DateOnly.FromDateTime(pbd.UtcDateTime) : null);
```

In `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`, replace the same call:

```csharp
            var nextDueDate = StoreBillingUtils.GetNextDueDate(
                store.PaymentStartDate,
                trialMonths,
                lastPaidBeforeDate);
```

Both call sites pass `nextDueDate` straight into `GetStatus`, which now accepts `DateOnly?`. No other change is needed.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test Application.Tests/Application.Tests.csproj`

Expected: PASS, including the pre-existing `StoreBillingUtilsTests` and the four
`RegisterStorePaymentCommandTests`, which exercise `GetNextDueDate` indirectly.

- [ ] **Step 7: Commit** *(the user runs this)*

```bash
git add src/Domain/Common/Utils/StoreBillingUtils.cs src/Domain/Entities/Billing/StoreBillingSummary.cs src/Application/Services/Billing/BillingService.cs src/Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs src/Application.Tests/Services/Billing/BillingServiceTests.cs src/Application.Tests/DomainUtils/StoreBillingUtilsTests.cs
git commit -m "fix(billing): model absent billing start date as null instead of DateOnly.MaxValue"
```

---

## Task 2: Relocate `IDateTimeProvider` to the Application layer

`Application` does not reference `Infrastructure`, so the existing clock abstraction is
unreachable from the billing handlers. The implementation already sits in
`SMCA.WebApi/Services/`, matching `IHttpContextService`; only the interface is misplaced.

**Files:**
- Create: `Application/Abstractions/Time/IDateTimeProvider.cs`
- Delete: `Infrastructure/Interfaces/Services/IDateTimeProvider.cs`
- Modify: `SMCA.WebApi/Services/DateTimeProvider.cs`, `WebApiTest/Services/DateTimeProvider.cs`
- Modify: `SMCA.WebApi/Program.cs:46`, `WebApiTest/Program.cs:26`
- Modify: `Infrastructure/Persistence/Interceptors/UpdateAuditableEntitiesInterceptor.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `Application.Abstractions.Time.IDateTimeProvider` with `DateTimeOffset UtcNow { get; }`. Tasks 3 and 8 inject it.

- [ ] **Step 1: Create the interface in its new home**

`Application/Abstractions/Time/IDateTimeProvider.cs`:

```csharp
namespace Application.Abstractions.Time
{
    public interface IDateTimeProvider
    {
        DateTimeOffset UtcNow { get; }
    }
}
```

- [ ] **Step 2: Delete the old interface**

Delete `Infrastructure/Interfaces/Services/IDateTimeProvider.cs`.

- [ ] **Step 3: Update every consumer's `using`**

Replace `using Infrastructure.Interfaces.Services;` with `using Application.Abstractions.Time;` in:
- `SMCA.WebApi/Services/DateTimeProvider.cs`
- `WebApiTest/Services/DateTimeProvider.cs`
- `Infrastructure/Persistence/Interceptors/UpdateAuditableEntitiesInterceptor.cs`
- `SMCA.WebApi/Program.cs`
- `WebApiTest/Program.cs`

In the interceptor and the `Program.cs` files, keep the existing `using Infrastructure.Interfaces.Services;` line only if other types from that namespace are still referenced in the file; otherwise remove it.

- [ ] **Step 4: Build the solution to verify nothing else referenced the old namespace**

Run: `dotnet build SMCA.sln`

Expected: build succeeds. If a file fails with "type or namespace `IDateTimeProvider` could not be found", add the new `using` there.

- [ ] **Step 5: Run the full unit suite to confirm the refactor changed no behaviour**

Run: `dotnet test Application.Tests/Application.Tests.csproj`

Expected: PASS, same test count as before this task.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/Application/Abstractions/Time/IDateTimeProvider.cs src/Infrastructure src/SMCA.WebApi src/WebApiTest
git commit -m "refactor(architecture): move IDateTimeProvider to the Application layer"
```

---

## Task 3: Inject the clock into the four billing call sites

**Files:**
- Modify: `Application/Services/Billing/BillingService.cs`
- Modify: `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`
- Modify: `Application/Features/StoreManagement/StorePayments/Queries/GetStoresToCollect/GetStoresToCollectQuery.cs`
- Modify: `Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs`
- Test: `Application.Tests/Services/Billing/BillingServiceTests.cs`

**Interfaces:**
- Consumes: `Application.Abstractions.Time.IDateTimeProvider` from Task 2; `StoreBillingSummary.NextDueDate` as `DateOnly?` from Task 1.
- Produces: `BillingService` constructor gains a fifth parameter `IDateTimeProvider dateTimeProvider`, appended last. Task 8 overrides the same abstraction from the test host.

- [ ] **Step 1: Write the failing test that pins "today" through the clock**

Add to `BillingServiceTests`, and add the field and constructor argument shown:

```csharp
    private readonly Mock<IDateTimeProvider> _clock = new();

    // In CreateSut(), append _clock.Object as the fifth constructor argument.

    [Fact]
    public async Task GetStoreBillingSummary_usesInjectedClock_forStatus()
    {
        var storeId = Guid.NewGuid();
        // Start 2026-01-10, trial 1 → due 2026-03-10. Grace 5 → overdue from 2026-03-16.
        ArrangeStore(storeId, new DateOnly(2026, 1, 10));
        _clock.Setup(c => c.UtcNow).Returns(new DateTimeOffset(2026, 3, 16, 0, 0, 0, TimeSpan.Zero));

        var summary = await CreateSut().GetStoreBillingSummaryAsync(storeId);

        summary.Status.Should().Be(StoreBillingStatusType.Vencido);
    }
```

Add `using Application.Abstractions.Time;` to the test file. In every other test in this
class, set the clock in `ArrangeStore` so existing cases keep working:

```csharp
        _clock.Setup(c => c.UtcNow).Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));
```

Place that line at the top of `ArrangeStore`, before the repository setups, so individual
tests can override it afterwards.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~BillingServiceTests"`

Expected: FAIL to compile — `BillingService` has no five-argument constructor.

- [ ] **Step 3: Inject the clock in `BillingService`**

Add `using Application.Abstractions.Time;`, add the field, extend the constructor, and
replace the `today` assignment:

```csharp
    private readonly IDateTimeProvider _dateTimeProvider;

    public BillingService(
        IStoreRepository storeRepository,
        IStorePaymentRepository paymentRepository,
        IModuleRepository moduleRepository,
        ISystemConfigurationRepository configRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _storeRepository = storeRepository;
        _paymentRepository = paymentRepository;
        _moduleRepository = moduleRepository;
        _configRepository = configRepository;
        _dateTimeProvider = dateTimeProvider;
    }
```

```csharp
        var today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);
```

- [ ] **Step 4: Inject the clock in the three handlers**

Apply the same pattern — `using Application.Abstractions.Time;`, a `private readonly IDateTimeProvider _dateTimeProvider;` field, a constructor parameter appended last, and the assignment — in:

- `GetMeQueryHandler`: replace `var today = DateOnly.FromDateTime(DateTime.UtcNow);` with `var today = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);`
- `GetStoresToCollectQueryHandler`: replace `var today = DateOnly.FromDateTime(DateTime.UtcNow);` with the same expression.
- `UpdateStoreCommandHandler`: replace `store.PaymentStartDate = DateOnly.FromDateTime(DateTime.UtcNow);` with `store.PaymentStartDate = DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime);`

- [ ] **Step 5: Run the unit suite to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj`

Expected: PASS. Handler tests that construct these handlers directly will fail to compile
until their `new` calls pass a mock clock — add
`new Mock<IDateTimeProvider>().Object` (with `UtcNow` set to `DateTimeOffset.UtcNow`) as
the last constructor argument in each affected test fixture.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/Application src/Application.Tests
git commit -m "refactor(billing): read the current date through IDateTimeProvider"
```

---

## Task 4: Backfill migration for sentinel `PaymentStartDate`

Migration `20260727165912` made the column nullable but left every pre-existing row at
`0001-01-01`, which classifies those stores as `Vencido` and strips their paid modules.

**Files:**
- Create: `Infrastructure/Migrations/PaymentStartDateBackfill.cs`
- Create: `Infrastructure/Migrations/<timestamp>_Backfill-PaymentStartDate-Null.cs` (generated)
- Create: `backend/scripts/06-20260728-Backfill-PaymentStartDate.sql`
- Test: `SMCA.WebApi.E2ETests/Billing/BackfillMigrationTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `Infrastructure.Migrations.PaymentStartDateBackfill.Sql` — a `public const string` referenced by both the migration and its test.

- [ ] **Step 1: Create the shared SQL constant**

`Infrastructure/Migrations/PaymentStartDateBackfill.cs`:

```csharp
namespace Infrastructure.Migrations
{
    /// <summary>
    /// Shared by the backfill migration and its test so the assertion cannot drift
    /// from the statement it verifies.
    /// </summary>
    public static class PaymentStartDateBackfill
    {
        public const string Sql =
            "UPDATE \"Store\" SET \"PaymentStartDate\" = NULL WHERE \"PaymentStartDate\" = DATE '0001-01-01'";
    }
}
```

- [ ] **Step 2: Write the failing test**

`SMCA.WebApi.E2ETests/Billing/BackfillMigrationTests.cs`:

```csharp
using Domain.Common.Constants;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Migrations;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class BackfillMigrationTests
{
    private readonly AppTestFactory _f;
    public BackfillMigrationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Backfill_convertsSentinelDate_toNull()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"backfill-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Backfill", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Backfill Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Backfill-{Guid.NewGuid():N}", owner.Id, true, tenantId,
            paymentStartDate: DateOnly.MinValue);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        try
        {
            await db.Database.ExecuteSqlRawAsync(PaymentStartDateBackfill.Sql);

            var reloaded = await db.Set<Store>().IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(s => s.Id == store.Id);
            reloaded.PaymentStartDate.Should().BeNull();
        }
        finally
        {
            db.Set<Store>().RemoveRange(
                await db.Set<Store>().IgnoreQueryFilters().Where(s => s.Id == store.Id).ToListAsync());
            db.Set<Owner>().RemoveRange(
                await db.Set<Owner>().IgnoreQueryFilters().Where(o => o.Id == owner.Id).ToListAsync());
            db.Set<User>().RemoveRange(
                await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == user.Id).ToListAsync());
            await db.SaveChangesAsync();
        }
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~BackfillMigrationTests"`

Expected: FAIL to compile — `PaymentStartDateBackfill` does not exist yet if Step 1 was skipped; otherwise PASS, since the test executes the SQL itself. A passing test here proves the statement is correct; Step 4 is what makes it run on deploy.

- [ ] **Step 4: Generate the migration**

Run: `dotnet ef migrations add Backfill-PaymentStartDate-Null --project Infrastructure --startup-project SMCA.WebApi`

Replace the generated `Up` and `Down` bodies:

```csharp
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(PaymentStartDateBackfill.Sql);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally empty: reverting would reintroduce the 0001-01-01 sentinel.
        }
```

Add `using Infrastructure.Migrations;` if the generated file sits in a different namespace.

- [ ] **Step 5: Write the deployment SQL script**

`backend/scripts/06-20260728-Backfill-PaymentStartDate.sql`, following the shape of
`05-20260727-Billing-Migrations.sql`. Replace `<MigrationId>` with the generated migration
id, exactly as it appears in the migration file name:

```sql
START TRANSACTION;

UPDATE "Store" SET "PaymentStartDate" = NULL WHERE "PaymentStartDate" = DATE '0001-01-01';

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('<MigrationId>', '8.0.3');

COMMIT;
```

- [ ] **Step 6: Run the test to verify it passes against the migrated database**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~BackfillMigrationTests"`

Expected: PASS.

- [ ] **Step 7: Commit** *(the user runs this)*

```bash
git add src/Infrastructure/Migrations src/SMCA.WebApi.E2ETests/Billing/BackfillMigrationTests.cs scripts/06-20260728-Backfill-PaymentStartDate.sql
git commit -m "fix(billing): backfill sentinel PaymentStartDate values to null"
```

---

## Task 5: End-to-end coverage for a free store on `/auth/me`

The unit layer already covers `FilterForBilling` for a free plan. What it cannot prove is
that the whole request survives: repository, `BillingService`, serialization.

**Files:**
- Test: `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` (modify)

**Interfaces:**
- Consumes: the nullable `NextDueDate` from Task 1.
- Produces: private helper `SeedFreeStoreAsync(string login)` returning `(Guid UserId, Guid StoreId)`, reused by nothing else — Task 9's shared seeds supersede it.

- [ ] **Step 1: Write the failing test**

Add to `GetMeBillingTests`:

```csharp
    [Fact]
    public async Task Me_freeStore_returnsNoAplica_andKeepsAllModules()
    {
        var login = $"billing-free-{Guid.NewGuid():N}@test.com";
        Guid userId = default;
        Guid storeId = default;
        try
        {
            (userId, storeId) = await SeedFreeStoreAsync(login);

            var response = await DbTestHelpers.AuthedClient(_factory, userId, login)
                .GetAsync("/api/v1/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.PaymentStatus.Should().Be("NoAplica");
            body.Data.PaymentDueDate.Should().BeNull();
            body.Data.StoreModuleIds.Should().Contain(FreeModuleId);
        }
        finally
        {
            await CleanupStoreAndUserAsync(storeId, userId);
        }
    }

    private async Task<(Guid UserId, Guid StoreId)> SeedFreeStoreAsync(string login)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing Free", "0000000000", login, tenantId);
        db.Set<User>().Add(user);

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing Free Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        // The production shape: a store that never activated a paid plan.
        var store = Store.Create($"FreeStore-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, store.Id);
    }
```

- [ ] **Step 2: Run the test**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Me_freeStore"`

Expected: PASS, because Task 1 already fixed the underlying defect. If it fails with a 500,
Task 1 was not applied — stop and fix Task 1 first rather than patching here.

- [ ] **Step 3: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs
git commit -m "test(billing): cover free store billing status end to end"
```

---

## Task 6: Add the missing `RegisterStorePayment` validator

**Files:**
- Create: `Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommandValidator.cs`
- Test: `SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentValidationTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `RegisterStorePaymentCommandValidator`, discovered automatically by the FluentValidation assembly scan already configured for `Application`.

- [ ] **Step 1: Write the failing test**

`SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentValidationTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class RegisterStorePaymentValidationTests
{
    private readonly AppTestFactory _f;
    public RegisterStorePaymentValidationTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Pay_withEmptyStoreId_returns400_codeStoreId()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var response = await client.PostAsync($"/api/v1/stores/{Guid.Empty}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().Contain(e => e.Code == "StoreId");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RegisterStorePaymentValidationTests"`

Expected: FAIL — without a validator the request reaches the handler and fails with the generic `StoreNotFound` message, so no error carries the code `StoreId`.

- [ ] **Step 3: Write the validator**

`Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommandValidator.cs`:

```csharp
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.StorePayments.Commands.RegisterStorePayment
{
    public class RegisterStorePaymentCommandValidator : AbstractValidator<RegisterStorePaymentCommand>
    {
        public RegisterStorePaymentCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.StoreId)
                .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RegisterStorePaymentValidationTests"`

Expected: PASS.

- [ ] **Step 5: Commit** *(the user runs this)*

```bash
git add src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommandValidator.cs src/SMCA.WebApi.E2ETests/Billing/RegisterStorePaymentValidationTests.cs
git commit -m "feat(billing): validate StoreId on register store payment"
```

---

## Task 7: Delete the dead `StoreBillingService`

**Files:**
- Delete: `Application/Services/Billing/StoreBillingService.cs`
- Delete: `Domain/Interfaces/Services/Billing/IStoreBillingService.cs`
- Modify: `Application/DependencyInjection.cs:57`

- [ ] **Step 1: Confirm it is unreferenced**

Run: `grep -rn "IStoreBillingService\|StoreBillingService" --include=*.cs . | grep -v "Services/Billing/StoreBillingService.cs" | grep -v "Interfaces/Services/Billing/IStoreBillingService.cs"`

Expected: exactly one line, the DI registration in `Application/DependencyInjection.cs`. If anything else appears, stop and report it instead of deleting.

- [ ] **Step 2: Delete both files and the registration**

Remove the line `services.AddScoped<IStoreBillingService, StoreBillingService>();` from `Application/DependencyInjection.cs`, then delete the two files.

- [ ] **Step 3: Build and run the full suite**

Run: `dotnet build SMCA.sln && dotnet test Application.Tests/Application.Tests.csproj`

Expected: build succeeds, tests PASS.

- [ ] **Step 4: Commit** *(the user runs this)*

```bash
git add src/Application src/Domain
git commit -m "chore(billing): remove unused StoreBillingService"
```

---

# PR 2 — Test infrastructure and the core coverage matrix (Tasks 8–15)

## Task 8: Test clock and billing seeds

**Files:**
- Create: `SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs`
- Create: `SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs`
- Modify: `SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs`
- Modify: `SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs`

**Interfaces:**
- Consumes: `Application.Abstractions.Time.IDateTimeProvider` from Task 2.
- Produces: `WebAppFixture.Clock` of type `MutableDateTimeProvider`, with `IDisposable Pin(DateTimeOffset utcNow)` and `void Reset()`. `BillingSeed.SeedFreeStoreAsync`, `SeedPaidStoreAsync`, `SeedPaymentAsync`, `CleanupAsync`. Tasks 9 to 14 consume all of these.

- [ ] **Step 1: Write the test clock**

`SMCA.WebApi.E2ETests/Infrastructure/MutableDateTimeProvider.cs`:

```csharp
using Application.Abstractions.Time;

namespace SMCA.WebApi.E2ETests.Infrastructure;

/// <summary>
/// Test clock. Defaults to the real time; <see cref="Pin"/> freezes it for the
/// lifetime of the returned scope and restores it on dispose.
/// </summary>
public sealed class MutableDateTimeProvider : IDateTimeProvider
{
    private DateTimeOffset? _pinned;

    public DateTimeOffset UtcNow => _pinned ?? DateTimeOffset.UtcNow;

    public IDisposable Pin(DateTimeOffset utcNow)
    {
        _pinned = utcNow;
        return new PinScope(this);
    }

    public void Reset() => _pinned = null;

    private sealed class PinScope : IDisposable
    {
        private readonly MutableDateTimeProvider _owner;
        public PinScope(MutableDateTimeProvider owner) => _owner = owner;
        public void Dispose() => _owner.Reset();
    }
}
```

- [ ] **Step 2: Register it in the test host**

Replace the body of `AppTestFactory.ConfigureWebHost` so it keeps the existing
configuration and adds the override:

```csharp
using Application.Abstractions.Time;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class AppTestFactory : WebApplicationFactory<Program>
{
    public MutableDateTimeProvider Clock { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddJsonFile(
                Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json"),
                optional: false,
                reloadOnChange: false);
        });

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDateTimeProvider>();
            services.AddSingleton<IDateTimeProvider>(Clock);
        });
    }
}
```

Expose it on the fixture by adding one property to `WebAppFixture`:

```csharp
    public MutableDateTimeProvider Clock => Factory.Clock;
```

- [ ] **Step 3: Write a test proving the override is wired**

Add `SMCA.WebApi.E2ETests/Billing/TestClockTests.cs`:

```csharp
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class TestClockTests
{
    private readonly WebAppFixture _fixture;
    public TestClockTests(WebAppFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task PinnedClock_movesBillingStatus_toVencido()
    {
        // Start 2026-01-10, trial 1 → due 2026-03-10, grace 5 → overdue from 2026-03-16.
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(new DateTimeOffset(2026, 3, 16, 0, 0, 0, TimeSpan.Zero)))
            {
                var response = await DbTestHelpers
                    .AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login)
                    .GetAsync("/api/v1/auth/me");

                var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
                body!.Data!.PaymentStatus.Should().Be("Vencido");
            }

            _fixture.Clock.UtcNow.Should().BeCloseTo(DateTimeOffset.UtcNow, TimeSpan.FromMinutes(1));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }
}
```

- [ ] **Step 4: Write the billing seeds**

`SMCA.WebApi.E2ETests/Infrastructure/BillingSeed.cs`:

```csharp
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace SMCA.WebApi.E2ETests.Infrastructure;

/// <summary>
/// Seeds named for the billing state they produce, not for their parameters.
/// </summary>
public static class BillingSeed
{
    public const int FreeModuleId = 7;   // Management, PriceIncluded = true
    public const int PaidModuleId = 6;   // Statistics, PriceIncluded = false

    public sealed record SeededStore(
        Guid UserId,
        string Login,
        Guid OwnerId,
        Guid StoreId,
        Guid TenantId,
        Guid? ReSellerId = null);

    /// <summary>A store that never activated a paid plan: PaymentStartDate is null.</summary>
    public static Task<SeededStore> SeedFreeStoreAsync(AppTestFactory factory)
        => SeedAsync(factory, paymentStartDate: null, paidModulePrice: null,
            paidModulePercentDiscount: 0f, reSellerPercentDiscount: null);

    /// <summary>A store on a paid plan, activated on the given date.</summary>
    public static Task<SeededStore> SeedPaidStoreAsync(AppTestFactory factory, DateOnly paymentStartDate,
        float paidModulePrice = 1000f, float paidModulePercentDiscount = 0f)
        => SeedAsync(factory, paymentStartDate, paidModulePrice, paidModulePercentDiscount,
            reSellerPercentDiscount: null);

    /// <summary>A paid store whose owner belongs to a reseller with the given commission rate.</summary>
    public static Task<SeededStore> SeedPaidStoreWithReSellerAsync(AppTestFactory factory,
        DateOnly paymentStartDate, float paidModulePrice, float paidModulePercentDiscount,
        float reSellerPercentDiscount)
        => SeedAsync(factory, paymentStartDate, paidModulePrice, paidModulePercentDiscount,
            reSellerPercentDiscount);

    private static async Task<SeededStore> SeedAsync(AppTestFactory factory, DateOnly? paymentStartDate,
        float? paidModulePrice, float paidModulePercentDiscount, float? reSellerPercentDiscount)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"billing-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Billing", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        Guid? reSellerId = null;
        if (reSellerPercentDiscount is not null)
        {
            db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
            var reSeller = ReSeller.Create(user.Id, true, 0, reSellerPercentDiscount.Value, tenantId, "E2E ReSeller");
            db.Set<ReSeller>().Add(reSeller);
            await db.SaveChangesAsync();
            reSellerId = reSeller.Id;
        }
        else
        {
            db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        }

        var owner = Owner.Create(user.Id, false, tenantId, "E2E Billing Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        if (reSellerId is not null)
        {
            db.Set<ReSellerOwner>().Add(ReSellerOwner.Create(
                reSellerId.Value, owner.Id, discountPrice: 0, reSellerPercentDiscount!.Value, tenantId));
            await db.SaveChangesAsync();
        }

        var store = Store.Create($"Billing-Store-{Guid.NewGuid():N}", owner.Id, approved: true,
            tenantId, paymentStartDate);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(store.Id, FreeModuleId, price: 0,
            modulePriceIncluded: true, modulePrice: 0, moduleDiscountPrice: 0,
            modulePercentDiscountPrice: 0, tenantId));

        if (paidModulePrice is not null)
        {
            db.Set<StoreModule>().Add(StoreModule.Create(store.Id, PaidModuleId, paidModulePrice.Value,
                modulePriceIncluded: false, modulePrice: paidModulePrice.Value, moduleDiscountPrice: 0,
                modulePercentDiscountPrice: paidModulePercentDiscount, tenantId));
        }

        user.SelectedStoreId = store.Id;
        await db.SaveChangesAsync();

        return new SeededStore(user.Id, login, owner.Id, store.Id, tenantId, reSellerId);
    }

    /// <summary>Insert a prior payment so the next due date derives from it.</summary>
    public static async Task SeedPaymentAsync(AppTestFactory factory, SeededStore store,
        DateOnly paymentBeforeDate, float price = 1000f, Guid? reSellerId = null, float reSellerAmount = 0f)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().Add(StorePayment.Create(
            storeId: store.StoreId,
            storePaymentStatusId: (int)StorePaymentStatusType.Paid,
            price: price,
            paymentBeforeDate: new DateTimeOffset(paymentBeforeDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            year: paymentBeforeDate.Year,
            month: paymentBeforeDate.Month,
            tenantId: store.TenantId,
            reSellerId: reSellerId,
            reSellerPercentDiscountPrice: 0,
            reSellerDiscountPrice: 0,
            reSellerAmount: reSellerAmount,
            byReSeller: reSellerId.HasValue));
        await db.SaveChangesAsync();
    }

    public static async Task CleanupAsync(AppTestFactory factory, SeededStore store)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        db.Set<StorePayment>().RemoveRange(await db.Set<StorePayment>().IgnoreQueryFilters()
            .Where(p => p.StoreId == store.StoreId).ToListAsync());
        db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(m => m.StoreId == store.StoreId).ToListAsync());
        db.Set<Store>().RemoveRange(await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.Id == store.StoreId).ToListAsync());
        db.Set<ReSellerOwner>().RemoveRange(await db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .Where(rso => rso.OwnerId == store.OwnerId).ToListAsync());
        db.Set<Owner>().RemoveRange(await db.Set<Owner>().IgnoreQueryFilters()
            .Where(o => o.Id == store.OwnerId).ToListAsync());
        if (store.ReSellerId is not null)
        {
            db.Set<ReSeller>().RemoveRange(await db.Set<ReSeller>().IgnoreQueryFilters()
                .Where(r => r.Id == store.ReSellerId).ToListAsync());
        }
        db.Set<UserRole>().RemoveRange(await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(ur => ur.UserId == store.UserId).ToListAsync());
        db.Set<User>().RemoveRange(await db.Set<User>().IgnoreQueryFilters()
            .Where(u => u.Id == store.UserId).ToListAsync());
        await db.SaveChangesAsync();
    }
}
```

- [ ] **Step 5: Run the clock test to verify it passes**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~TestClockTests"`

Expected: PASS. A failure with the real date instead of the pinned one means
`ConfigureTestServices` ran before the app's own registration — move the override into
`builder.ConfigureServices` after the default registration and re-run.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Infrastructure src/SMCA.WebApi.E2ETests/Billing/TestClockTests.cs
git commit -m "test(e2e): add a pinnable test clock and billing seeds"
```

---

## Task 9: Remaining `/auth/me` billing states

**Files:**
- Test: `SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs` (modify)

**Interfaces:**
- Consumes: `WebAppFixture.Clock`, `BillingSeed` from Task 8.

- [ ] **Step 1: Write the three failing tests**

Add to `GetMeBillingTests`. The class currently holds only `AppTestFactory`; add
`private readonly WebAppFixture _fixture;` and assign it in the constructor if it is not
already stored.

```csharp
    [Theory]
    // Start 2026-01-10, trial 1 → due 2026-03-10. Due-soon window 5 days, grace 5 days.
    [InlineData("2026-03-06", "PorVencer")]
    [InlineData("2026-03-12", "EnGracia")]
    public async Task Me_paidStore_reportsExpectedStatus_andKeepsAllModules(string todayUtc, string expectedStatus)
    {
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse($"{todayUtc}T00:00:00Z")))
            {
                var response = await DbTestHelpers
                    .AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login)
                    .GetAsync("/api/v1/auth/me");

                response.StatusCode.Should().Be(HttpStatusCode.OK);
                var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
                body!.Data!.PaymentStatus.Should().Be(expectedStatus);

                // Grace must not restrict access.
                body.Data.StoreModuleIds.Should().Contain(BillingSeed.PaidModuleId);
                body.Data.StoreModuleIds.Should().Contain(BillingSeed.FreeModuleId);
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Theory]
    // IsInTrial is computed as PaymentStartDate.AddMonths(1) >= today — see Known debt in the spec.
    [InlineData("2026-01-20", true)]
    [InlineData("2026-03-01", false)]
    public async Task Me_reportsIsInTrial_forFirstMonthAfterActivation(string todayUtc, bool expected)
    {
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse($"{todayUtc}T00:00:00Z")))
            {
                var response = await DbTestHelpers
                    .AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login)
                    .GetAsync("/api/v1/auth/me");

                var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
                body!.Data!.IsInTrial.Should().Be(expected);
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }
```

- [ ] **Step 2: Run the tests**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~GetMeBillingTests"`

Expected: PASS. These pin existing behaviour; no production change belongs in this task. If
`PorVencer` or `EnGracia` comes back as something else, re-derive the dates from the
seeded `TestingPeriodInMonths = 1` and `PaymentGraceDays = 5` before changing any code.

- [ ] **Step 3: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/GetMeBillingTests.cs
git commit -m "test(billing): cover remaining billing states on /auth/me"
```

---

## Task 10: `PUT /stores/{id}/payment-date` gaps

**Files:**
- Create: `SMCA.WebApi.E2ETests/Billing/SetPaymentDateErrorHandlingTests.cs`

These four scenarios are all error-handling cases, so they open the error-handling file for this endpoint. Task 16 adds the remaining two to the same file and creates its three siblings.

**Interfaces:**
- Consumes: `BillingSeed` from Task 8.
- Produces: `SetPaymentDateErrorHandlingTests`, extended by Task 16.

- [ ] **Step 1: Write the failing tests**

```csharp
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class SetPaymentDateErrorHandlingTests
{
    private readonly WebAppFixture _fixture;
    public SetPaymentDateErrorHandlingTests(WebAppFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task ReSeller_cannotSetPaymentDate()
    {
        var seeded = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _fixture.Factory, new DateOnly(2026, 1, 10), 1000f, 0f, 15f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login);

            var response = await client.PutAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/payment-date",
                new { PaymentStartDate = "2026-07-01" });

            // Exactly 403: HasUserPermissionRequirementFilter returns ForbidResult before the
            // handler runs. A 400 here would mean the filter let the request through.
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Fact]
    public async Task SuperAdmin_unknownStore_returns400_withEmptyErrors()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PutAsJsonAsync(
                $"/api/v1/stores/{Guid.NewGuid()}/payment-date",
                new { PaymentStartDate = "2026-07-01" });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            // ApiException path: ErrorHandlerMiddleware only fills Errors for ValidationException.
            // An empty Errors list confirms this failed on the handler guard, not on validation.
            body.Errors.Should().BeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task SuperAdmin_emptyStoreId_returns400_codeStoreId()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PutAsJsonAsync(
                $"/api/v1/stores/{Guid.Empty}/payment-date",
                new { PaymentStartDate = "2026-07-01" });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "StoreId");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task SuperAdmin_missingPaymentStartDate_returns400_codePaymentStartDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_fixture.Factory);
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PutAsJsonAsync(
                $"/api/v1/stores/{seeded.StoreId}/payment-date",
                new { });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Errors.Should().Contain(e => e.Code == "PaymentStartDate");
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~SetPaymentDateErrorHandlingTests"`

Expected: PASS. If `ReSeller_cannotSetPaymentDate` returns 200, the role guard is broken —
report it as a new defect rather than relaxing the assertion. If it returns 400 instead of
403, the filter is not rejecting and the handler is catching it — also a defect, and the
reason the assertion is exact.

- [ ] **Step 3: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/SetPaymentDateErrorHandlingTests.cs
git commit -m "test(billing): cover payment-date authorization and validation gaps"
```

---

## Task 11: `POST /stores/{id}/payments` — roles and errors

**Files:**
- Create: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentHappyPathTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentErrorHandlingTests.cs`

The pre-existing `RegisterStorePaymentTests.cs` keeps its two tests and is not modified. Every new test for this endpoint goes into the category files, which Tasks 12 and 17 extend.

**Interfaces:**
- Consumes: `BillingSeed` from Task 8.
- Produces: `RegisterPaymentHappyPathTests` and `RegisterPaymentErrorHandlingTests`, both extended by later tasks. Each class declares `private readonly WebAppFixture _fixture;` assigned in its constructor, and the standard `[Collection("e2e")]` attribute.

- [ ] **Step 1: Write the happy-path test**

In `RegisterPaymentHappyPathTests.cs`:

```csharp
    [Fact]
    public async Task SuperAdmin_paysAnyStore_persistsPaidPaymentWithAdvancedDueDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        // Module 1000 at 10% → amount 900. Start 2026-01-10, trial 1 → due 2026-03-10.
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10),
            paidModulePrice: 1000f, paidModulePercentDiscount: 10f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var payment = await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(p => p.StoreId == seeded.StoreId);

            payment.Price.Should().BeApproximately(900f, 0.001f);
            payment.StorePaymentStatusId.Should().Be((int)StorePaymentStatusType.Paid);
            payment.ByReSeller.Should().BeFalse();
            payment.ReSellerId.Should().BeNull();
            payment.ReSellerAmount.Should().Be(0f);
            DateOnly.FromDateTime(payment.PaymentBeforeDate.UtcDateTime).Should().Be(new DateOnly(2026, 4, 10));
            payment.Year.Should().Be(2026);
            payment.Month.Should().Be(4);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

A 200 on a billing endpoint proves the request was accepted, not that the right amount was recorded. This asserts what landed in the table.

- [ ] **Step 2: Write the error-handling tests**

In `RegisterPaymentErrorHandlingTests.cs`:

```csharp
    [Fact]
    public async Task Unauthenticated_returns401()
    {
        var response = await _fixture.Factory.CreateClient()
            .PostAsync($"/api/v1/stores/{Guid.NewGuid()}/payments", null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OwnerAdmin_cannotRegisterPayment()
    {
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login);

            var response = await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null);

            // Exactly 403: an OwnerAdmin can never hold StorePaymentAdmin, which is declared
            // [HasRoles(SuperAdmin, ReSeller)], so the filter rejects before the handler runs.
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Fact]
    public async Task SuperAdmin_storeNeverActivated_returns400_andWritesNoPayment()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_fixture.Factory);
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            // A rejected write that still wrote would pass a status-only assertion.
            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .IgnoreQueryFilters().AsNoTracking()
                .CountAsync(p => p.StoreId == seeded.StoreId)).Should().Be(0);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task SuperAdmin_unknownStore_returns400_withEmptyErrors()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            var response = await client.PostAsync($"/api/v1/stores/{Guid.NewGuid()}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().BeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

- [ ] **Step 3: Run the tests**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RegisterPaymentHappyPathTests|FullyQualifiedName~RegisterPaymentErrorHandlingTests"`

Expected: PASS.

- [ ] **Step 4: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/RegisterPaymentHappyPathTests.cs src/SMCA.WebApi.E2ETests/Billing/RegisterPaymentErrorHandlingTests.cs
git commit -m "test(billing): cover register payment authorization and error paths"
```

---

## Task 12: `POST /stores/{id}/payments` — money and due-date advance

The handler-level tests already assert amount, commission and the one-month advance. These
prove the same values survive persistence and are readable back from PostgreSQL.

**Files:**
- Test: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentHappyPathTests.cs` (modify — add the reseller test)
- Create: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentEdgeCaseTests.cs` (the consecutive-payments test)

**Interfaces:**
- Consumes: `BillingSeed.SeedPaidStoreWithReSellerAsync`, `WebAppFixture.Clock` from Task 8; the two classes from Task 11.
- Produces: `RegisterPaymentEdgeCaseTests`, extended by Task 17.

- [ ] **Step 1: Write the failing tests**

```csharp
    [Fact]
    public async Task ReSeller_payment_persistsDiscountedAmount_andCommission()
    {
        // Module 1000 at 10% discount → amount 900. Reseller at 15% → commission 135.
        var seeded = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _fixture.Factory, new DateOnly(2026, 1, 10),
            paidModulePrice: 1000f, paidModulePercentDiscount: 10f, reSellerPercentDiscount: 15f);
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login);

            var response = await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var payment = await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(p => p.StoreId == seeded.StoreId);

            payment.Price.Should().BeApproximately(900f, 0.001f);
            payment.ReSellerAmount.Should().BeApproximately(135f, 0.001f);
            payment.ByReSeller.Should().BeTrue();
            payment.ReSellerId.Should().Be(seeded.ReSellerId);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Fact]
    public async Task Consecutive_payments_advanceDueDate_byOneMonthEach()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        // Start 2026-01-10, trial 1 → first due 2026-03-10.
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);

            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null))
                .StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var dueDates = await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.StoreId == seeded.StoreId)
                .OrderBy(p => p.PaymentBeforeDate)
                .Select(p => p.PaymentBeforeDate)
                .ToListAsync();

            dueDates.Should().HaveCount(2);
            DateOnly.FromDateTime(dueDates[0].UtcDateTime).Should().Be(new DateOnly(2026, 4, 10));
            DateOnly.FromDateTime(dueDates[1].UtcDateTime).Should().Be(new DateOnly(2026, 5, 10));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

- [ ] **Step 2: Run the tests**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RegisterPayment"`

Expected: PASS. The first due date is `start + (trial 1 + 1) = 2026-03-10`, and the handler
adds one month before persisting, so the first payment records `2026-04-10`. If the actual
values differ, verify `TestingPeriodInMonths` in the test database before touching code.

- [ ] **Step 3: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/RegisterPaymentHappyPathTests.cs src/SMCA.WebApi.E2ETests/Billing/RegisterPaymentEdgeCaseTests.cs
git commit -m "test(billing): assert persisted payment amounts, commission and due dates"
```

---

## Task 13: `GET /stores/to-collect` and `GET /stores/reseller-commissions` gaps

**Files:**
- Create: `SMCA.WebApi.E2ETests/Billing/ToCollectHappyPathTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/ToCollectErrorHandlingTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/ToCollectIntegrationTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsHappyPathTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsEdgeCaseTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsErrorHandlingTests.cs`

The pre-existing `GetStoresToCollectTests.cs` and `GetReSellerCommissionsTests.cs` keep their current tests and are not modified. `StoreToCollectData` already lives at the bottom of `GetStoresToCollectTests.cs`; reuse it rather than declaring a second copy.

**Interfaces:**
- Consumes: `BillingSeed`, `WebAppFixture.Clock` from Task 8.
- Produces: the six classes above, extended by Tasks 18 and 19. Each declares `private readonly WebAppFixture _fixture;` assigned in its constructor and carries `[Collection("e2e")]`.

- [ ] **Step 1: Write the failing `to-collect` tests**

`ToCollect_includesOnlyDueSoonAndGraceStores` and `ToCollect_amountReflectsModuleDiscount` go in `ToCollectHappyPathTests`; `ToCollect_asOwnerAdmin_isRejected` in `ToCollectErrorHandlingTests`; `ToCollect_asReSeller_returnsOnlyOwnStores` in `ToCollectIntegrationTests`.

```csharp
    [Theory]
    // Start 2026-01-10, trial 1 → due 2026-03-10. Grace 5, due-soon 5.
    // The boundary rows matter more than the mid-band ones: an off-by-one in the
    // >= / > comparisons inside GetStatus only shows up on the edges.
    [InlineData("2026-02-01", false, null)]           // AlDia, well before      → excluded
    [InlineData("2026-03-04", false, null)]           // AlDia, one day early    → excluded
    [InlineData("2026-03-05", true, "PorVencer")]     // exactly the due-soon edge
    [InlineData("2026-03-06", true, "PorVencer")]     // inside the window
    [InlineData("2026-03-10", true, "PorVencer")]     // the due day itself
    [InlineData("2026-03-11", true, "EnGracia")]      // first grace day
    [InlineData("2026-03-15", true, "EnGracia")]      // last grace day
    [InlineData("2026-03-16", false, null)]           // first day past grace    → excluded
    [InlineData("2026-03-20", false, null)]           // Vencido                 → excluded
    public async Task ToCollect_includesOnlyDueSoonAndGraceStores(
        string todayUtc, bool expectedPresent, string? expectedStatus)
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse($"{todayUtc}T00:00:00Z")))
            {
                var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                    .GetAsync("/api/v1/stores/to-collect");

                var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
                var row = body!.Data!.FirstOrDefault(s => s.StoreId == seeded.StoreId);

                if (expectedPresent)
                {
                    row.Should().NotBeNull();
                    row!.Status.Should().Be(expectedStatus);
                }
                else
                {
                    row.Should().BeNull();
                }
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task ToCollect_amountReflectsModuleDiscount()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10),
            paidModulePrice: 1000f, paidModulePercentDiscount: 10f);
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse("2026-03-06T00:00:00Z")))
            {
                var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                    .GetAsync("/api/v1/stores/to-collect");

                var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
                var row = body!.Data!.Single(s => s.StoreId == seeded.StoreId);
                row.Amount.Should().BeApproximately(900f, 0.001f);
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task ToCollect_asOwnerAdmin_isRejected()
    {
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login)
                .GetAsync("/api/v1/stores/to-collect");

            // Exactly 403 — rejected by the filter, not by the handler guard.
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Fact]
    public async Task ToCollect_asReSeller_returnsOnlyOwnStores()
    {
        var mine = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _fixture.Factory, new DateOnly(2026, 1, 10), 1000f, 0f, 15f);
        var other = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse("2026-03-06T00:00:00Z")))
            {
                var response = await DbTestHelpers.AuthedClient(_fixture.Factory, mine.UserId, mine.Login)
                    .GetAsync("/api/v1/stores/to-collect");

                var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
                body!.Data!.Should().Contain(s => s.StoreId == mine.StoreId);
                body.Data!.Should().NotContain(s => s.StoreId == other.StoreId);
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, other);
            await BillingSeed.CleanupAsync(_fixture.Factory, mine);
        }
    }
```

- [ ] **Step 2: Write the failing `reseller-commissions` tests**

`Commissions_asSuperAdmin_includeAnotherResellersPayments` goes in `ResellerCommissionsHappyPathTests`; `Commissions_excludePaymentsWithoutReSeller` in `ResellerCommissionsEdgeCaseTests`; the two rejection tests in `ResellerCommissionsErrorHandlingTests`.

Add this DTO once, at the bottom of `ResellerCommissionsHappyPathTests.cs`, so every commission assertion is typed instead of matching raw JSON:

```csharp
public sealed class ReSellerCommissionData
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int PaymentCount { get; set; }
    public float TotalCommission { get; set; }
}
```

```csharp
    [Fact]
    public async Task Commissions_unauthenticated_returns401()
    {
        var response = await _fixture.Factory.CreateClient()
            .GetAsync("/api/v1/stores/reseller-commissions");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Commissions_asOwnerAdmin_isRejected()
    {
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, seeded.UserId, seeded.Login)
                .GetAsync("/api/v1/stores/reseller-commissions");

            // Exactly 403 — rejected by the filter, not by the handler guard.
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
        }
    }

    [Fact]
    public async Task Commissions_asSuperAdmin_includeAnotherResellersPayments()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreWithReSellerAsync(
            _fixture.Factory, new DateOnly(2026, 1, 10), 1000f, 0f, 15f);
        await BillingSeed.SeedPaymentAsync(_fixture.Factory, seeded,
            new DateOnly(2026, 4, 10), price: 1000f, reSellerId: seeded.ReSellerId, reSellerAmount: 150f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                .GetAsync("/api/v1/stores/reseller-commissions");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<List<ReSellerCommissionData>>>(ApiResponse.Json);

            var bucket = body!.Data!.Single(b => b.Year == 2026 && b.Month == 4);
            bucket.PaymentCount.Should().BeGreaterThanOrEqualTo(1);
            bucket.TotalCommission.Should().BeGreaterThanOrEqualTo(150f);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task Commissions_excludePaymentsWithoutReSeller()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        await BillingSeed.SeedPaymentAsync(_fixture.Factory, seeded,
            new DateOnly(2026, 4, 10), price: 1000f, reSellerId: null, reSellerAmount: 0f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                .GetAsync("/api/v1/stores/reseller-commissions");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content
                .ReadFromJsonAsync<ApiResponse<List<ReSellerCommissionData>>>(ApiResponse.Json);

            // The payment carries no reseller, so it must not contribute a bucket.
            // Baseline first, because other tests may have left reseller payments in 2026/4.
            var bucket = body!.Data!.FirstOrDefault(b => b.Year == 2026 && b.Month == 4);
            (bucket?.PaymentCount ?? 0).Should().Be(0);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

Add `using SMCA.WebApi.E2ETests.Billing;` if the edge-case file sits in a different namespace than the DTO — it does not by default, both are under `SMCA.WebApi.E2ETests.Billing`.

- [ ] **Step 3: Run both endpoint suites**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ToCollect|FullyQualifiedName~ResellerCommissions"`

Expected: PASS.

- [ ] **Step 4: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/ToCollectHappyPathTests.cs src/SMCA.WebApi.E2ETests/Billing/ToCollectErrorHandlingTests.cs src/SMCA.WebApi.E2ETests/Billing/ToCollectIntegrationTests.cs src/SMCA.WebApi.E2ETests/Billing/ResellerCommissionsHappyPathTests.cs src/SMCA.WebApi.E2ETests/Billing/ResellerCommissionsEdgeCaseTests.cs src/SMCA.WebApi.E2ETests/Billing/ResellerCommissionsErrorHandlingTests.cs
git commit -m "test(billing): cover collection filtering, scoping and commission grouping"
```

---

## Task 14: Activation-on-first-paid

**Files:**
- Create: `SMCA.WebApi.E2ETests/Billing/StoreActivationOnFirstPaidTests.cs`

**Interfaces:**
- Consumes: `BillingSeed` from Task 8; the injected clock from Task 3.

- [ ] **Step 1: Write the failing end-to-end tests**

`SMCA.WebApi.E2ETests/Billing/StoreActivationOnFirstPaidTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class StoreActivationOnFirstPaidTests
{
    private readonly WebAppFixture _fixture;
    public StoreActivationOnFirstPaidTests(WebAppFixture fixture) => _fixture = fixture;

    private async Task<DateOnly?> ReadPaymentStartDateAsync(Guid storeId)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = await db.Set<Store>().IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.Id == storeId);
        return store.PaymentStartDate;
    }

    private async Task<HttpResponseMessage> UpdateStoreAsync(Guid adminId, string login,
        Guid storeId, string name, int[] moduleIds)
    {
        var client = DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login);
        return await client.PutAsJsonAsync($"/api/v1/stores/{storeId}",
            new { Id = storeId, Name = name, Address = "addr", Description = "desc", IsActive = true, ModuleIds = moduleIds });
    }

    [Fact]
    public async Task AssigningPaidModule_toFreeStore_setsPaymentStartDate_toPinnedToday()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_fixture.Factory);
        try
        {
            (await ReadPaymentStartDateAsync(seeded.StoreId)).Should().BeNull();

            using (_fixture.Clock.Pin(DateTimeOffset.Parse("2026-06-15T00:00:00Z")))
            {
                var response = await UpdateStoreAsync(adminId, login, seeded.StoreId,
                    $"Activated-{Guid.NewGuid():N}",
                    new[] { BillingSeed.FreeModuleId, BillingSeed.PaidModuleId });

                response.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            (await ReadPaymentStartDateAsync(seeded.StoreId)).Should().Be(new DateOnly(2026, 6, 15));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task AssigningOnlyFreeModules_leavesPaymentStartDate_null()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_fixture.Factory);
        try
        {
            var response = await UpdateStoreAsync(adminId, login, seeded.StoreId,
                $"StillFree-{Guid.NewGuid():N}", new[] { BillingSeed.FreeModuleId });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            (await ReadPaymentStartDateAsync(seeded.StoreId)).Should().BeNull();
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task ExistingPaymentStartDate_isNotOverwritten()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var original = new DateOnly(2026, 1, 10);
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, original);
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse("2026-06-15T00:00:00Z")))
            {
                var response = await UpdateStoreAsync(adminId, login, seeded.StoreId,
                    $"Renamed-{Guid.NewGuid():N}",
                    new[] { BillingSeed.FreeModuleId, BillingSeed.PaidModuleId });

                response.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            (await ReadPaymentStartDateAsync(seeded.StoreId)).Should().Be(original);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
}
```

- [ ] **Step 2: Run the end-to-end tests**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreActivationOnFirstPaidTests"`

Expected: PASS. If the update request returns 400 with code `ModuleIds`, module 6 is not
marked available for stores in the test database — seed it the way
`FeaturesActivateGapTests` seeds optional rows, then re-run.

- [ ] **Step 3: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/StoreActivationOnFirstPaidTests.cs
git commit -m "test(billing): cover activation on first paid module"
```

**No handler-level unit tests here, deliberately.** `UpdateStoreCommandHandler` takes ten
dependencies and calls `_storeRepository.Where(...).Any(...)`, so mocking it means
returning an `IQueryable` and asserting the shape of the query instead of the rule. The
three activation rules are fully covered by the end-to-end tests above.

---

## Task 15: Pin the Statistics module price on `features/activate`

**Files:**
- Test: `SMCA.WebApi.E2ETests/Features/FeaturesActivateTests.cs` (modify)

- [ ] **Step 1: Write the failing assertion**

Add to `FeaturesActivateTests`:

```csharp
    [Fact]
    public async Task Activate_setsStatisticsModulePrice_to1000()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);

            var response = await client.PostAsync("/api/v1/features/activate", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var statistics = await db.Set<Domain.Entities.Modules.Module>()
                .IgnoreQueryFilters().AsNoTracking()
                .FirstAsync(m => m.Id == (int)Domain.Common.Enums.ModuleType.Statistics);

            statistics.IsActive.Should().BeTrue();
            statistics.Price.Should().BeApproximately(1000f, 0.001f);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }
```

Match the field name for the factory used elsewhere in this file (`_f` or `_factory`).

- [ ] **Step 2: Run the test**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~FeaturesActivateTests"`

Expected: PASS.

- [ ] **Step 3: Run the entire suite before opening PR 2**

Run: `dotnet test SMCA.sln`

Expected: all projects PASS. Any failure in a test this plan did not touch means a shared
seed leaked state — fix the cleanup, not the assertion.

- [ ] **Step 4: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Features/FeaturesActivateTests.cs
git commit -m "test(features): assert the Statistics module price set by activate"
```

---

# PR 3 — Full per-endpoint suites for the four new endpoints (Tasks 16–19)

Tasks 16 to 19 complete the four-category suite for each new billing endpoint: happy path, edge cases, error handling, integrations. They extend the files opened in Tasks 10 to 13 and add the missing category files.

These tests pin behaviour that already exists. **They are expected to pass on the first run.** That does not make them decoration: each one is a boundary, a persisted value, or a role that no current test touches. When one of them fails, read it as a defect report and stop — the correct move is never to relax the assertion so the suite goes green.

Shared prerequisite for all four tasks — add this seed to `BillingSeed` (Task 8) before starting:

```csharp
    /// <summary>
    /// An OwnerAdmin on a store with the free Management module. Authenticates and is
    /// store-scoped, but can never hold StorePaymentAdmin — the canonical 403 caller.
    /// </summary>
    public static Task<SeededStore> SeedOwnerAdminWithoutPaymentFeatureAsync(AppTestFactory factory)
        => SeedAsync(factory, paymentStartDate: DateOnly.FromDateTime(DateTime.UtcNow),
            paidModulePrice: null, paidModulePercentDiscount: 0f, reSellerPercentDiscount: null);
```

---

## Task 16: `PUT /stores/{id}/payment-date` — complete the suite

**Files:**
- Create: `SMCA.WebApi.E2ETests/Billing/SetPaymentDateHappyPathTests.cs`
- Create: `SMCA.WebApi.E2ETests/Billing/SetPaymentDateEdgeCaseTests.cs`
- Modify: `SMCA.WebApi.E2ETests/Billing/SetPaymentDateErrorHandlingTests.cs` (from Task 10)
- Create: `SMCA.WebApi.E2ETests/Billing/SetPaymentDateIntegrationTests.cs`

**Interfaces:**
- Consumes: `BillingSeed` including `SeedOwnerAdminWithoutPaymentFeatureAsync`, `WebAppFixture.Clock`, `AuthzSeed.SeedStoreUserAsync`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the happy-path tests**

`SetPaymentDateHappyPathTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Billing;

[Collection("e2e")]
public sealed class SetPaymentDateHappyPathTests
{
    private readonly WebAppFixture _fixture;
    public SetPaymentDateHappyPathTests(WebAppFixture fixture) => _fixture = fixture;

    internal static async Task<DateOnly?> ReadPaymentStartDateAsync(WebAppFixture fixture, Guid storeId)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var store = await db.Set<Store>().IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(s => s.Id == storeId);
        return store.PaymentStartDate;
    }

    [Fact]
    public async Task SetPaymentDate_onFreeStore_persistsTheDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedFreeStoreAsync(_fixture.Factory);
        try
        {
            (await ReadPaymentStartDateAsync(_fixture, seeded.StoreId)).Should().BeNull();

            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/payment-date",
                    new { PaymentStartDate = "2026-07-01" });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().BeTrue();

            (await ReadPaymentStartDateAsync(_fixture, seeded.StoreId)).Should().Be(new DateOnly(2026, 7, 1));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }

    [Fact]
    public async Task SetPaymentDate_onAlreadyActivatedStore_overwritesTheDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                .PutAsJsonAsync($"/api/v1/stores/{seeded.StoreId}/payment-date",
                    new { PaymentStartDate = "2026-09-15" });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            (await ReadPaymentStartDateAsync(_fixture, seeded.StoreId)).Should().Be(new DateOnly(2026, 9, 15));
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
}
```

The existing `SuperAdmin_sets_payment_date_returns_200` asserts the status and nothing else. These assert what landed in the database, which is the point of the endpoint.

- [ ] **Step 2: Write the edge-case tests**

`SetPaymentDateEdgeCaseTests.cs`, same scaffold. Each test seeds a SuperAdmin plus the store it needs, calls `PUT`, and cleans up in `finally`. Reuse `SetPaymentDateHappyPathTests.ReadPaymentStartDateAsync`.

| Test | Arrange | Act | Assert |
|---|---|---|---|
| `SetPaymentDate_routeIdWinsOverBodyId` | two free stores A and B | `PUT /stores/{A}/payment-date` with body `{ StoreId = B, PaymentStartDate = "2026-07-01" }` | 200; A has `2026-07-01`, B still `null` |
| `SetPaymentDate_farPastDate_isAccepted` | free store | body `{ PaymentStartDate = "1900-01-01" }` | 200; persisted. Pins current behaviour — there is no lower bound |
| `SetPaymentDate_farFutureDate_isAccepted` | free store | body `{ PaymentStartDate = "2099-12-31" }` | 200; persisted. A future start yields `AlDia` and `MonthsActive == 0` |
| `SetPaymentDate_leapDay_isAccepted` | free store | body `{ PaymentStartDate = "2028-02-29" }` | 200; persisted exactly, no shift to 03-01 |
| `SetPaymentDate_calledTwice_keepsTheSecondValue` | free store | `PUT 2026-07-01`, then `PUT 2026-08-01` | both 200; final value `2026-08-01` |

- [ ] **Step 3: Extend the error-handling file**

Add to `SetPaymentDateErrorHandlingTests` (created in Task 10):

| Test | Arrange | Act | Assert |
|---|---|---|---|
| `SetPaymentDate_malformedDate_returns400` | SuperAdmin; free store | body `{ PaymentStartDate = "not-a-date" }` | 400. Model binding fails before the pipeline, so assert the status only — no error code is produced |
| `SetPaymentDate_asStoreUser_returns403` | `AuthzSeed.SeedStoreUserAsync(factory, grantedFeatureId: null)` | `PUT` on that user's store | 403 |

- [ ] **Step 4: Write the integration tests**

`SetPaymentDateIntegrationTests.cs`:

| Test | Arrange | Act | Assert |
|---|---|---|---|
| `SetPaymentDate_thenGetMe_reportsTheNewDueDate` | SuperAdmin plus an OwnerAdmin owning a paid store; clock pinned to `2026-02-01` | `PUT` with `2026-01-10`, then `GET /auth/me` as the owner | `PaymentDueDate == 2026-03-10` — start plus trial 1 plus one month |
| `SetPaymentDate_activatesStoreForCollection` | free store, absent from `to-collect`; clock pinned to `2026-03-06` | `PUT` with `2026-01-10`, then `GET /stores/to-collect` as SuperAdmin | the store now appears with `Status == "PorVencer"` |
| `SetPaymentDate_makesRegisterPaymentSucceed` | free store | `POST payments`, then `PUT` a start date, then `POST payments` again | first 400, second 200 |

- [ ] **Step 5: Run the endpoint suite**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~SetPaymentDate"`

Expected: PASS, 12 tests across the four files plus the 4 from Task 10.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/SetPaymentDate*.cs
git commit -m "test(billing): complete the payment-date endpoint suite"
```

---

## Task 17: `POST /stores/{id}/payments` — complete the suite

**Files:**
- Modify: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentHappyPathTests.cs` (from Task 11)
- Modify: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentEdgeCaseTests.cs` (from Task 12)
- Modify: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentErrorHandlingTests.cs` (from Task 11)
- Create: `SMCA.WebApi.E2ETests/Billing/RegisterPaymentIntegrationTests.cs`

**Interfaces:**
- Consumes: `BillingSeed` including `SeedOwnerAdminWithoutPaymentFeatureAsync`, `WebAppFixture.Clock`.
- Produces: the private helper `AddPaidModuleAsync` shown below, used by three tests in this task.

- [ ] **Step 1: Add the module helper and the happy-path tests**

Add to `RegisterPaymentHappyPathTests`:

```csharp
    private async Task AddPaidModuleAsync(BillingSeed.SeededStore store, int moduleId,
        float price, float percentDiscount, float flatDiscount = 0f, bool isActive = true)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var module = Domain.Entities.StoreModules.StoreModule.Create(store.StoreId, moduleId, price,
            modulePriceIncluded: false, modulePrice: price, moduleDiscountPrice: flatDiscount,
            modulePercentDiscountPrice: percentDiscount, store.TenantId);
        module.IsActive = isActive;
        db.Set<Domain.Entities.StoreModules.StoreModule>().Add(module);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task RegisterPayment_withMultiplePaidModules_sumsTheirCurrentPrices()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        // Module A: 1000 at 10% → 900. Module B: 500 at 0% → 500. Expected total 1400.
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10),
            paidModulePrice: 1000f, paidModulePercentDiscount: 10f);
        await AddPaidModuleAsync(seeded, moduleId: 2, price: 500f, percentDiscount: 0f);
        try
        {
            var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                .PostAsync($"/api/v1/stores/{seeded.StoreId}/payments", null);

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var payment = await db.Set<Domain.Entities.StorePayments.StorePayment>()
                .IgnoreQueryFilters().AsNoTracking()
                .SingleAsync(p => p.StoreId == seeded.StoreId);

            payment.Price.Should().BeApproximately(1400f, 0.001f);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

`StoreModule.IsActive` comes from `AuditableEntity`; if it is not settable, seed the module and then update it through the context before the act step.

| Second test | Arrange | Assert |
|---|---|---|
| `RegisterPayment_ignoresFreeModules_inTheAmount` | `SeedPaidStoreAsync` already adds the free Management module alongside one paid module of 1000 | `Price == 1000` — the free module contributes nothing |

- [ ] **Step 2: Add the edge-case tests**

Add to `RegisterPaymentEdgeCaseTests`:

| Test | Arrange | Assert |
|---|---|---|
| `RegisterPayment_dueDateOnMonthEnd_clampsToShorterMonth` | start `2026-01-31`, trial 1 → due `2026-03-31`; one payment | persisted `PaymentBeforeDate` is `2026-04-30`, not `2026-05-01` |
| `RegisterPayment_storeWithOnlyFreeModules_persistsZeroAmount` | paid start date, no non-free module | 200; `Price == 0`. Pins current behaviour — the handler does not reject a zero-amount payment |
| `RegisterPayment_moduleDiscountExceedingPrice_clampsAmountToZero` | one paid module, price 100, `flatDiscount: 500` | `Price == 0` — `GetCurrentPrice` floors at zero rather than going negative |
| `RegisterPayment_inactiveStoreModule_isExcludedFromAmount` | active paid module 1000 plus `AddPaidModuleAsync(..., isActive: false)` at 700 | `Price == 1000` |
| `RegisterPayment_resellerWithZeroDiscount_persistsZeroCommission` | `SeedPaidStoreWithReSellerAsync(..., reSellerPercentDiscount: 0f)` | `ByReSeller == true`, `ReSellerAmount == 0`, `ReSellerId` not null |

- [ ] **Step 3: Add the error-handling tests**

Add to `RegisterPaymentErrorHandlingTests`:

| Test | Arrange | Assert |
|---|---|---|
| `RegisterPayment_asStoreUser_returns403` | `AuthzSeed.SeedStoreUserAsync(factory, null)` | 403 |
| `RegisterPayment_asReSellerNotOwningStore_createsNoPayment` | reseller with the feature; a store owned by a different owner | 400 **and** `CountAsync(p => p.StoreId == otherStoreId) == 0`. The existing `ReSeller_pays_store_not_owned_returns_400` asserts only the status; a rejected write that still wrote would pass it |

- [ ] **Step 4: Write the integration tests**

`RegisterPaymentIntegrationTests.cs`:

| Test | Arrange | Assert |
|---|---|---|
| `RegisterPayment_movesStoreOutOfToCollect` | paid store `PorVencer` at pinned `2026-03-06`, confirmed present in `to-collect` | after `POST payments`, the same query at the same pinned date no longer lists it |
| `RegisterPayment_byReSeller_appearsInResellerCommissions` | reseller at 15%, module 1000 at 10% → amount 900, commission 135 | `GET /stores/reseller-commissions` as that reseller returns a `2026/4` bucket with `PaymentCount == 1` and `TotalCommission == 135` |
| `RegisterPayment_updatesNextDueDateReportedByGetMe` | OwnerAdmin owning the paid store; SuperAdmin registers the payment; clock pinned | `GET /auth/me` before and after: `PaymentDueDate` advances exactly one month |
| `RegisterPayment_snapshotsCommission_evenIfResellerRateChangesLater` | pay at 15%, then update `ReSellerOwner.PercentDiscountPrice` to 40% through the context, then read the payment back | `ReSellerAmount` still reflects 15%. The payment is a snapshot; if this fails the commission is being recomputed at read time and historical payouts would drift |

- [ ] **Step 5: Run the endpoint suite**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RegisterPayment"`

Expected: PASS.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/RegisterPayment*.cs
git commit -m "test(billing): complete the register-payment endpoint suite"
```

---

## Task 18: `GET /stores/to-collect` — complete the suite

Every test in this task pins the clock. A suite about date-derived states that reads the real clock is a suite that fails on a different day of the month.

**Files:**
- Modify: `SMCA.WebApi.E2ETests/Billing/ToCollectHappyPathTests.cs` (from Task 13)
- Create: `SMCA.WebApi.E2ETests/Billing/ToCollectEdgeCaseTests.cs`
- Modify: `SMCA.WebApi.E2ETests/Billing/ToCollectErrorHandlingTests.cs` (from Task 13)
- Modify: `SMCA.WebApi.E2ETests/Billing/ToCollectIntegrationTests.cs` (from Task 13)

**Interfaces:**
- Consumes: `BillingSeed`, `WebAppFixture.Clock`, `StoreToCollectData` from the pre-existing `GetStoresToCollectTests.cs`.

- [ ] **Step 1: Add the happy-path tests**

```csharp
    [Fact]
    public async Task ToCollect_rowCarriesStoreNameOwnerNameAndDueDate()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_fixture.Factory, login, "Password123");
        var seeded = await BillingSeed.SeedPaidStoreAsync(_fixture.Factory, new DateOnly(2026, 1, 10));
        try
        {
            using (_fixture.Clock.Pin(DateTimeOffset.Parse("2026-03-06T00:00:00Z")))
            {
                var response = await DbTestHelpers.AuthedClient(_fixture.Factory, adminId, login)
                    .GetAsync("/api/v1/stores/to-collect");

                var body = await response.Content
                    .ReadFromJsonAsync<ApiResponse<List<StoreToCollectData>>>(ApiResponse.Json);
                var row = body!.Data!.Single(s => s.StoreId == seeded.StoreId);

                row.StoreName.Should().NotBeNullOrEmpty();
                row.OwnerName.Should().NotBeNullOrEmpty();
                row.NextDueDate.Should().Be(new DateOnly(2026, 3, 10));
                row.Status.Should().Be("PorVencer");
            }
        }
        finally
        {
            await BillingSeed.CleanupAsync(_fixture.Factory, seeded);
            await DbTestHelpers.CleanupUserAsync(_fixture.Factory, adminId);
        }
    }
```

`OwnerName` resolves through `store.Owner?.User?.FullName ?? ""` — two optional navigations. If either is not included by the repository query the field silently becomes an empty string and every existing test still passes.

| Second test | Arrange | Assert |
|---|---|---|
| `ToCollect_amountSumsMultiplePaidModules` | 1000 at 10% plus a second paid module of 500, pinned `2026-03-06` | `Amount == 1400` |

- [ ] **Step 2: Write the edge-case tests**

`ToCollectEdgeCaseTests.cs`:

| Test | Arrange | Assert |
|---|---|---|
| `ToCollect_storeWithPriorPayment_derivesDueDateFromThatPayment` | start `2026-01-10`; `SeedPaymentAsync` with `PaymentBeforeDate = 2026-06-10`; pinned `2026-06-06` | present, `NextDueDate == 2026-06-10`, `Status == "PorVencer"`. Proves the last payment wins over the trial-derived date |
| `ToCollect_storeWithOnlyFreeModules_appearsWithZeroAmount` | paid start date, no non-free module, pinned `2026-03-06` | present with `Amount == 0`. Pins current behaviour — state drives inclusion, amount does not |
| `ToCollect_noEligibleStores_returnsEmptyListNotNull` | pinned to `2026-02-01`, where the seeded store is `AlDia` | 200, `Succeeded == true`, `Data` is an empty list rather than `null` |
| `ToCollect_ordersByDueDateAscending_withThreeStores` | three paid stores whose due dates land 1, 2 and 3 days out from the pinned date, seeded out of order | the three rows appear in ascending `NextDueDate` order. The existing ordering test guards its loop with `if (data.Count > 1)` and passes vacuously when the list is short |
| `ToCollect_inactiveStoreModule_excludedFromAmount` | active paid module 1000 plus an inactive one of 700, pinned `2026-03-06` | `Amount == 1000` |

- [ ] **Step 3: Add the error-handling tests**

| Test | Arrange | Assert |
|---|---|---|
| `ToCollect_asStoreUser_returns403` | `AuthzSeed.SeedStoreUserAsync(factory, null)` | 403 |
| `ToCollect_withMalformedToken_returns401` | `client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt")` | 401. The existing test covers the absent-token case; a malformed token takes a different path through authentication |

- [ ] **Step 4: Add the integration tests**

| Test | Arrange | Assert |
|---|---|---|
| `ToCollect_afterSetPaymentDate_storeBecomesCollectable` | free store, confirmed absent from the list | after `PUT payment-date` with `2026-01-10` and pinned `2026-03-06`, present |
| `ToCollect_afterRegisterPayment_storeLeavesTheList` | store `PorVencer` and confirmed present | after `POST payments`, absent at the same pinned date |

- [ ] **Step 5: Run the endpoint suite**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ToCollect"`

Expected: PASS.

- [ ] **Step 6: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/ToCollect*.cs
git commit -m "test(billing): complete the stores-to-collect endpoint suite"
```

---

## Task 19: `GET /stores/reseller-commissions` — complete the suite

This is the only one of the four endpoints with no date logic, so no test here pins the clock.

**Files:**
- Modify: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsHappyPathTests.cs` (from Task 13)
- Modify: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsEdgeCaseTests.cs` (from Task 13)
- Modify: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsErrorHandlingTests.cs` (from Task 13)
- Create: `SMCA.WebApi.E2ETests/Billing/ResellerCommissionsIntegrationTests.cs`

**Interfaces:**
- Consumes: `BillingSeed`, `ReSellerCommissionData` from Task 13.

- [ ] **Step 1: Add the happy-path tests**

Each test seeds its own reseller so buckets from other tests cannot bleed in. Assert on the bucket for that reseller's period, and scope the request to the reseller itself rather than to a SuperAdmin wherever the count matters.

| Test | Arrange | Assert |
|---|---|---|
| `Commissions_sumsMultiplePaymentsInTheSamePeriod` | one reseller, two payments in `2026/4` with commissions 150 and 100, queried as that reseller | a single `2026/4` bucket with `PaymentCount == 2` and `TotalCommission == 250` |
| `Commissions_separatesDistinctPeriods` | same reseller, one payment in `2026/4` and one in `2026/5` | two buckets, each `PaymentCount == 1` |
| `Commissions_orderedByYearThenMonthDescending` | same reseller, payments in `2025/12`, `2026/1` and `2026/4` | the returned sequence is exactly `2026/4`, `2026/1`, `2025/12` |

- [ ] **Step 2: Add the edge-case tests**

| Test | Arrange | Assert |
|---|---|---|
| `Commissions_resellerWithNoPayments_returnsEmptyList` | reseller with the feature and zero payments | 200, `Data` is an empty list, not `null` |
| `Commissions_includeResellerPaymentsWithZeroCommission` | payment with `ReSellerId` set but `ReSellerAmount == 0` | the bucket **is** returned, with `TotalCommission == 0`. The query filters on `ReSellerId.HasValue` alone. This disagrees with the deleted `StoreBillingService.GetReSellerCommissionsAsync`, which also required `ReSellerAmount > 0`; the handler is the surviving definition and this test pins it |
| `Commissions_paymentsAcrossYearBoundary_groupSeparately` | payments in `2025/12` and `2026/1` | two buckets, no merging |

- [ ] **Step 3: Add the error-handling test**

| Test | Arrange | Assert |
|---|---|---|
| `Commissions_asStoreUser_returns403` | `AuthzSeed.SeedStoreUserAsync(factory, null)` | 403 |

- [ ] **Step 4: Write the integration tests**

`ResellerCommissionsIntegrationTests.cs`:

| Test | Arrange | Assert |
|---|---|---|
| `Commissions_asReSeller_excludeAnotherResellersPayments` | resellers R1 and R2, each with one payment in `2026/4` | querying as R1 returns a `2026/4` bucket with `PaymentCount == 1`, not 2 |
| `Commissions_reflectPaymentRegisteredThroughTheApi` | reseller at 15%, module 1000 at 10%; register the payment through `POST /stores/{id}/payments` rather than seeding it | a `2026/4` bucket appears with `TotalCommission == 135`. The write path and the read path agree on the same number |

- [ ] **Step 5: Run the endpoint suite**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ResellerCommissions"`

Expected: PASS.

- [ ] **Step 6: Run the entire solution before opening PR 3**

Run: `dotnet test SMCA.sln`

Expected: all projects PASS. Run it twice in a row — the second run catches seeds that were not cleaned up.

- [ ] **Step 7: Commit** *(the user runs this)*

```bash
git add src/SMCA.WebApi.E2ETests/Billing/ResellerCommissions*.cs
git commit -m "test(billing): complete the reseller-commissions endpoint suite"
```

---

## File layout after Tasks 16–19

Each new endpoint ends with four category files. The three pre-existing files keep the tests that were already there and are never modified.

| Endpoint | Pre-existing (untouched) | Category files |
|---|---|---|
| `payment-date` | *(its 3 tests live in `StoreUpdateTests.cs`)* | `SetPaymentDateHappyPathTests`, `SetPaymentDateEdgeCaseTests`, `SetPaymentDateErrorHandlingTests`, `SetPaymentDateIntegrationTests` |
| `payments` | `RegisterStorePaymentTests` | `RegisterPaymentHappyPathTests`, `RegisterPaymentEdgeCaseTests`, `RegisterPaymentErrorHandlingTests`, `RegisterPaymentIntegrationTests` |
| `to-collect` | `GetStoresToCollectTests` | `ToCollectHappyPathTests`, `ToCollectEdgeCaseTests`, `ToCollectErrorHandlingTests`, `ToCollectIntegrationTests` |
| `reseller-commissions` | `GetReSellerCommissionsTests` | `ResellerCommissionsHappyPathTests`, `ResellerCommissionsEdgeCaseTests`, `ResellerCommissionsErrorHandlingTests`, `ResellerCommissionsIntegrationTests` |

---

## Verification checklist before each PR

**PR 1 (Tasks 1–7):**
- `dotnet build SMCA.sln` succeeds
- `dotnet test Application.Tests/Application.Tests.csproj` passes
- `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` passes
- The backfill migration appears in `__EFMigrationsHistory` after `dotnet ef database update`
- `backend/scripts/06-20260728-Backfill-PaymentStartDate.sql` carries the same migration id as the generated migration file

**PR 2 (Tasks 8–15):**
- `dotnet test SMCA.sln` passes
- No test leaves rows behind: re-running the suite twice in a row passes both times

**PR 3 (Tasks 16–19):**
- `dotnet test SMCA.sln` passes, twice in a row
- Every new endpoint has its four category files and no test file outside them was modified
- No assertion was weakened to make a test pass. If any of these tests failed on its first run, the failure is written up as a defect, not absorbed into the assertion
