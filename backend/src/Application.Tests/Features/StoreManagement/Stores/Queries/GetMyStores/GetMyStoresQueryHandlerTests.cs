using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Queries.GetMyStores;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Queries.GetMyStores;

public class GetMyStoresQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IMapper> _mockMapper;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly GetMyStoresQueryHandler _handler;
    private readonly Guid _userId;

    public GetMyStoresQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockMapper = new Mock<IMapper>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _userId = Guid.NewGuid();
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);
        _handler = new GetMyStoresQueryHandler(
            _mockStoreRepository.Object,
            _mockMapper.Object,
            _mockHttpContextService.Object,
            _mockStorePaymentRepository.Object,
            _mockSystemConfigurationRepository.Object,
            _mockLocalizer.Object);
    }

    [Fact]
    public async Task Handle_not_admin_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: false, isSuperAdmin: false, isOwnerAdmin: false);

        var act = () => _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Handle_owner_admin_uses_GetAllStoresByOwnerUserId_with_currentUser_and_default_store_excluded()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        _mockMapper
            .Setup(x => x.Map<OwnerStoreDto>(It.IsAny<Store>()))
            .Returns(new OwnerStoreDto { Id = stores[0].Id, Name = "Store 1" });

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresByOwnerUserIdAsync(_userId, DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresWithModulesAsync(It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_super_admin_uses_GetAllStoresWithModules()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: true, isOwnerAdmin: false);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresWithModulesAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { CreateStore("Any Store") });
        _mockMapper
            .Setup(x => x.Map<OwnerStoreDto>(It.IsAny<Store>()))
            .Returns(new OwnerStoreDto { Id = Guid.NewGuid(), Name = "Any Store" });

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockStoreRepository.Verify(
            x => x.GetAllStoresWithModulesAsync(DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_free_store_has_null_next_due_date()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var free = CreateStore("Free", paymentStartDate: null);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { free });
        var dto = new OwnerStoreDto { Id = free.Id };
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(free)).Returns(dto);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(free.Id))
            .ReturnsAsync((StorePayment?)null);

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        result.Data!.Single().NextDueDate.Should().BeNull();
    }

    [Fact]
    public async Task Handle_paid_store_without_payments_computes_first_due_date()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var start = new DateOnly(2026, 6, 1);
        var paid = CreateStore("Paid", paymentStartDate: start);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { paid });
        var dto = new OwnerStoreDto { Id = paid.Id };
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(paid)).Returns(dto);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(paid.Id))
            .ReturnsAsync((StorePayment?)null);

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        // Canonical calculation: activation + trial(1) + 1 post-paid month.
        result.Data!.Single().NextDueDate.Should().Be(new DateOnly(2026, 8, 1));
    }

    [Fact]
    public async Task Handle_paid_store_with_payment_uses_last_paid_before_date()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var start = new DateOnly(2026, 1, 1);
        var paid = CreateStore("Paid", paymentStartDate: start);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { paid });
        var dto = new OwnerStoreDto { Id = paid.Id };
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(paid)).Returns(dto);
        var lastPaidBefore = new DateOnly(2026, 10, 15);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(paid.Id))
            .ReturnsAsync(CreatePayment(paid.Id, lastPaidBefore));

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        result.Data!.Single().NextDueDate.Should().Be(lastPaidBefore);
    }

    [Fact]
    public async Task Handle_disapproved_store_with_recorded_payment_returns_null_next_due_date()
    {
        // REQ-MS-1: a disapproved store's recorded payment must NOT resurrect the date.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var start = new DateOnly(2026, 1, 1);
        var disapproved = CreateStore("Disapproved", paymentStartDate: start, approved: false);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { disapproved });
        var dto = new OwnerStoreDto { Id = disapproved.Id };
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(disapproved)).Returns(dto);
        var lastPaidBefore = new DateOnly(2026, 10, 15);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(disapproved.Id))
            .ReturnsAsync(CreatePayment(disapproved.Id, lastPaidBefore));

        // Act
        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        // Assert — Approved guard wraps the whole computation (payment, override,
        // clock all ignored for a disapproved store).
        result.Data!.Single().NextDueDate.Should().BeNull();
    }

    [Fact]
    public async Task Handle_reads_the_trial_length_once_up_front()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { CreateStore("A"), CreateStore("B"), CreateStore("C") });
        _mockMapper
            .Setup(x => x.Map<OwnerStoreDto>(It.IsAny<Store>()))
            .Returns(new OwnerStoreDto());
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);

        await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        // One trial read shared by every store — not one per store (plan R-2 note).
        _mockSystemConfigurationRepository.Verify(
            x => x.GetTestingPeriodInMonthsAsync(),
            Times.Once);
    }

    [Fact]
    public async Task Handle_stores_sharing_a_plan_get_the_price_of_their_own_snapshot()
    {
        // Owner rule: "the price a store must pay is the sum of all the modules it has
        // assigned and that are ACTIVE in its configuration". Two stores on the SAME
        // plan with very different StoreModule snapshots must therefore expose
        // DIFFERENT prices — each its own billing total, never the shared plan total.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var bloated = CreateStore("Bloated");   // Pago — stated explicitly, not the Store.Create default
        var lean = CreateStore("Lean");         // Pago — stated explicitly
        AddBillableModule(bloated, BillingSeedStatisticsId, price: 100f);
        AddBillableModule(bloated, WarehousesModuleId, price: 250f);
        AddBillableModule(lean, BillingSeedStatisticsId, price: 40f, percentDiscount: 50f);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { bloated, lean });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(bloated)).Returns(new OwnerStoreDto { Id = bloated.Id });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(lean)).Returns(new OwnerStoreDto { Id = lean.Id });
        SetupNoPayments();

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        var dtos = result.Data!.ToList();
        dtos.Should().HaveCount(2);
        // Bloated: Statistics 100 + Warehouses 250, no discounts → base 350, current 350.
        dtos[0].PlanPrice.Should().Be(350f);
        dtos[0].PlanCurrentPrice.Should().Be(350f);
        // Lean: a single Statistics @40 with a 50% discount → base 40, current 20.
        dtos[1].PlanPrice.Should().Be(40f);
        dtos[1].PlanCurrentPrice.Should().Be(20f);
        dtos[1].PlanPrice.Should().NotBe(dtos[0].PlanPrice,
            "same plan but a different assigned-and-active module set ⇒ a different price");
    }

    [Fact]
    public async Task Handle_store_with_no_module_rows_reports_zero_and_not_its_paid_plan_total()
    {
        // Same Pago plan on both stores, but only one of them has an assigned module.
        // The empty one must report 0 (a real total over zero billable rows) — NOT the
        // paid Pago catalog total, which is what the plan-keyed rule used to return.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var empty = CreateStore("Empty");       // Pago, no StoreModule rows at all
        var loaded = CreateStore("Loaded");     // Pago, one billable row
        AddBillableModule(loaded, BillingSeedStatisticsId, price: 100f);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { empty, loaded });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(empty)).Returns(new OwnerStoreDto { Id = empty.Id });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(loaded)).Returns(new OwnerStoreDto { Id = loaded.Id });
        SetupNoPayments();

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        var dtos = result.Data!.ToList();
        // Zero, not null: the store IS approved, it simply has nothing to pay for.
        dtos[0].PlanPrice.Should().Be(0f);
        dtos[0].PlanCurrentPrice.Should().Be(0f);
        dtos[1].PlanPrice.Should().Be(100f);
        dtos[1].PlanCurrentPrice.Should().Be(100f);
    }

    [Fact]
    public async Task Handle_disapproved_store_returns_null_prices()
    {
        // Disapproved stores expose no price — the Approved guard lives in the backend,
        // not in the frontend, and it still wraps the snapshot computation.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var disapproved = CreateStore("Disapproved", approved: false);
        AddBillableModule(disapproved, BillingSeedStatisticsId, price: 100f);
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { disapproved });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(disapproved)).Returns(new OwnerStoreDto { Id = disapproved.Id });
        SetupNoPayments();

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        var dto = result.Data!.Single();
        dto.PlanPrice.Should().BeNull();
        dto.PlanCurrentPrice.Should().BeNull();
    }

    [Fact]
    public async Task Handle_skips_inactive_and_price_included_module_rows()
    {
        // The billing rule's two exclusions, pinned through the card: an inactive
        // (soft-deleted) leftover row and a bundled row contribute NOTHING.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true, isSuperAdmin: false, isOwnerAdmin: true);
        var store = CreateStore("Mixed");
        AddBillableModule(store, BillingSeedStatisticsId, price: 100f);
        store.StoreModules.Add(InactiveRow(store, WarehousesModuleId, price: 900f));
        store.StoreModules.Add(StoreModule.Create(
            store.Id, MultiStoresModuleId, 500f, true, 500f, 0f, 0f, Guid.NewGuid()));
        _mockStoreRepository
            .Setup(x => x.GetAllStoresByOwnerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store> { store });
        _mockMapper.Setup(x => x.Map<OwnerStoreDto>(store)).Returns(new OwnerStoreDto { Id = store.Id });
        SetupNoPayments();

        var result = await _handler.Handle(new GetMyStoresQuery(), CancellationToken.None);

        var dto = result.Data!.Single();
        dto.PlanPrice.Should().Be(100f, "the inactive row and the price-included row are outside the total");
        dto.PlanCurrentPrice.Should().Be(100f);
    }

    private const int BillingSeedStatisticsId = 6;
    private const int WarehousesModuleId = 13;
    private const int MultiStoresModuleId = 14;

    /// <summary>Appends an ACTIVE, NOT price-included row — the only kind that bills.</summary>
    private static void AddBillableModule(
        Store store, int moduleId, float price, float percentDiscount = 0f, float fixedDiscount = 0f)
        => store.StoreModules.Add(StoreModule.Create(
            store.Id, moduleId, price, false, price, fixedDiscount, percentDiscount, Guid.NewGuid()));

    /// <summary>A soft-deleted leftover row — billable shape, but IsActive = false.</summary>
    private static StoreModule InactiveRow(Store store, int moduleId, float price)
    {
        var row = StoreModule.Create(store.Id, moduleId, price, false, price, 0f, 0f, Guid.NewGuid());
        row.IsActive = false;
        return row;
    }

    /// <summary>No payments seeded — the billing clock falls back to anchor + trial + 1.</summary>
    private void SetupNoPayments()
    {
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);
    }

    private void ArrangeRoles(bool isSuperAdminOrOwnerAdmin, bool isSuperAdmin, bool isOwnerAdmin)
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(isSuperAdminOrOwnerAdmin);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(isSuperAdmin);
        _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(isOwnerAdmin);
    }

    /// <summary>
    /// The plan is an EXPLICIT parameter, never the <c>Store.Create</c> default: these tests are
    /// about plan-keyed pricing scenarios, and store-birth-superior (2026-10-11) moved that default
    /// from Pago to Superior — a silent default here would change what "two stores sharing a plan"
    /// even means.
    /// </summary>
    private static Store CreateStore(string name, DateOnly? paymentStartDate = null, bool approved = true,
        int storePlanId = (int)StorePlanType.Pago)
    {
        return Store.Create(name, Guid.NewGuid(), approved, Guid.NewGuid(), paymentStartDate, storePlanId: storePlanId);
    }

    private static StorePayment CreatePayment(Guid storeId, DateOnly paidBefore)
    {
        return StorePayment.Create(
            storeId, 1, 10f,
            new DateTimeOffset(paidBefore.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            paidBefore.Year, paidBefore.Month, Guid.NewGuid(),
            reSellerId: null, 0, 0, 0, byReSeller: false);
    }
}
