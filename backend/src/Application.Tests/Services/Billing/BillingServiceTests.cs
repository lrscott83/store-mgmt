using Application.Abstractions.Time;
using Application.Services.Billing;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;
using Moq;
using Xunit;

namespace Application.Tests.Services.Billing;

public class BillingServiceTests : IDisposable
{
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<IStorePaymentRepository> _paymentRepository = new();
    private readonly Mock<IModuleRepository> _moduleRepository = new();
    private readonly Mock<ISystemConfigurationRepository> _configRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions());
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerId = Guid.NewGuid();

    public BillingServiceTests()
    {
        // Default config values — deterministic across all tests
        _configRepository.Setup(x => x.GetPaymentGraceDaysAsync()).ReturnsAsync(5);
        _configRepository.Setup(x => x.GetTestingPeriodInMonthsAsync()).ReturnsAsync(1);
        _configRepository.Setup(x => x.GetDueSoonDaysAsync()).ReturnsAsync(5);

        // Default payment repo: no last payment, 0 paid months
        _paymentRepository.Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);
        _paymentRepository.Setup(x => x.GetPaidMonthsCountAsync(It.IsAny<Guid>()))
            .ReturnsAsync(0);

        _dateTimeProvider.Setup(c => c.UtcNow).Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));
    }

    private BillingService CreateSut() => new(
        _storeRepository.Object,
        _paymentRepository.Object,
        _moduleRepository.Object,
        _configRepository.Object,
        _dateTimeProvider.Object,
        _cache);

    /// <summary>
    /// Creates a Store with the given modules and wires up all repository mocks
    /// so that the service can resolve every dependency for the given storeId.
    /// </summary>
    private void ArrangeStore(Guid storeId, DateOnly? paymentStartDate, params StoreModule[] storeModules)
    {
        var store = Store.Create("Test Store", _ownerId, true, _tenantId, paymentStartDate);
        typeof(Store).GetProperty("Id")!.SetValue(store, storeId);
        store.StoreModules = storeModules.ToList();

        // Must mirror what BillingService actually calls: GetByIdAsync is a bare FindAsync and
        // would leave StoreModules unloaded, so the service reads the including-modules getter.
        _storeRepository.Setup(x => x.GetStoreByIdIncludingModulesAsync(storeId)).ReturnsAsync(store);

        // Build Module entities that mirror the StoreModules
        var moduleList = storeModules.Select(sm =>
            Module.Create(
                sm.ModuleId,
                $"Module-{sm.ModuleId}",
                order: 1,
                sm.ModulePriceIncluded,
                sm.ModulePrice,
                discountPrice: 0f,
                percentDiscountPrice: 0f,
                availableToStore: true,
                isActive: true)
        ).Cast<Module>().ToList();

        _moduleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(moduleList);
    }

    // ── Test 1: Free store (null PaymentStartDate) → NoAplica, no throw ──────────
    [Fact]
    public async Task GetStoreBillingSummary_freeStore_returnsNoAplica_andDoesNotThrow()
    {
        var storeId = Guid.NewGuid();
        ArrangeStore(storeId, paymentStartDate: null);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        result.Status.Should().Be(StoreBillingStatusType.NoAplica);
    }

    // ── Test 2: Unknown store → NoAplica ──────────────────────────────────────────
    [Fact]
    public async Task GetStoreBillingSummary_unknownStore_returnsNoAplica()
    {
        var storeId = Guid.NewGuid();
        _storeRepository.Setup(x => x.GetStoreByIdIncludingModulesAsync(storeId)).ReturnsAsync((Store?)null);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        result.Status.Should().Be(StoreBillingStatusType.NoAplica);
    }

    // ── Test 3: Only free modules → PlanType = "Free" ─────────────────────────────
    [Fact]
    public async Task GetStoreBillingSummary_freeStore_planTypeIsFree()
    {
        var storeId = Guid.NewGuid();
        var freeModule = StoreModule.Create(
            storeId, moduleId: 1,
            price: 0f, modulePriceIncluded: true,
            modulePrice: 0f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f,
            _tenantId);

        ArrangeStore(storeId, DateOnly.FromDateTime(DateTime.UtcNow), freeModule);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        result.PlanType.Should().Be("Free");
    }

    // ── Test 4: Paid store, no payments → amount = sum of module prices ───────────
    [Fact]
    public async Task GetStoreBillingSummary_paidStoreWithoutPayments_amountIsSumOfPaidModules()
    {
        var storeId = Guid.NewGuid();
        var paidModule1 = StoreModule.Create(
            storeId, moduleId: 1,
            price: 100f, modulePriceIncluded: false,
            modulePrice: 100f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f,
            _tenantId);
        var paidModule2 = StoreModule.Create(
            storeId, moduleId: 2,
            price: 200f, modulePriceIncluded: false,
            modulePrice: 200f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f,
            _tenantId);

        ArrangeStore(storeId, DateOnly.FromDateTime(DateTime.UtcNow), paidModule1, paidModule2);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        result.CurrentMonthAmount.Should().Be(300f);
    }

    // ── Test 5: Last payment exists → uses its Price as CurrentMonthAmount ────────
    [Fact]
    public async Task GetStoreBillingSummary_withLastPayment_usesItsPrice_asCurrentAmount()
    {
        var storeId = Guid.NewGuid();
        var paidModule = StoreModule.Create(
            storeId, moduleId: 1,
            price: 100f, modulePriceIncluded: false,
            modulePrice: 100f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f,
            _tenantId);

        ArrangeStore(storeId, DateOnly.FromDateTime(DateTime.UtcNow), paidModule);

        var lastPayment = StorePayment.Create(
            storeId,
            storePaymentStatusId: 1,
            price: 500f,
            paymentBeforeDate: new DateTimeOffset(2026, 6, 10, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 6,
            _tenantId,
            reSellerId: null,
            reSellerPercentDiscountPrice: 0f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 0f,
            byReSeller: false);

        _paymentRepository.Setup(x => x.GetLastByStoreIdAsync(storeId)).ReturnsAsync(lastPayment);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        // Uses last payment's price (500), NOT the module sum (100)
        result.CurrentMonthAmount.Should().Be(500f);
    }

    // ── Test 6: Reseller payment → commission is computed ─────────────────────────
    [Fact]
    public async Task GetStoreBillingSummary_lastPaymentByReSeller_reportsCommission()
    {
        var storeId = Guid.NewGuid();
        var paidModule = StoreModule.Create(
            storeId, moduleId: 1,
            price: 200f, modulePriceIncluded: false,
            modulePrice: 200f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f,
            _tenantId);

        ArrangeStore(storeId, DateOnly.FromDateTime(DateTime.UtcNow), paidModule);

        var lastPayment = StorePayment.Create(
            storeId,
            storePaymentStatusId: 1,
            price: 200f,
            paymentBeforeDate: new DateTimeOffset(2026, 6, 10, 0, 0, 0, TimeSpan.Zero),
            year: 2026,
            month: 6,
            _tenantId,
            reSellerId: Guid.NewGuid(),
            reSellerPercentDiscountPrice: 25f,
            reSellerDiscountPrice: 0f,
            reSellerAmount: 0f,
            byReSeller: true);

        _paymentRepository.Setup(x => x.GetLastByStoreIdAsync(storeId)).ReturnsAsync(lastPayment);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        // Commission = 200 × 25% = 50 (flat = 0)
        result.ReSellerCommission.Should().Be(50f);
    }

    // ── Test 7: Future PaymentStartDate → MonthsActive >= 0 ──────────────────────
    [Fact]
    public async Task GetStoreBillingSummary_monthsActive_isNeverNegative()
    {
        var storeId = Guid.NewGuid();
        var futureDate = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(3));

        ArrangeStore(storeId, futureDate);

        var sut = CreateSut();
        var result = await sut.GetStoreBillingSummaryAsync(storeId);

        result.MonthsActive.Should().BeGreaterThanOrEqualTo(0);
    }

    public void Dispose() => _cache?.Dispose();
}
