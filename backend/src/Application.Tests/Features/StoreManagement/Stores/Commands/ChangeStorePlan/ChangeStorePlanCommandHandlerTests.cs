using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.ChangeStorePlan;
using Application.UnitOfWorks;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StorePayments;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.ChangeStorePlan;

/// <summary>
/// Unit tests for ChangeStorePlanCommandHandler covering:
/// - Owner of the store changes plan: StorePlanId written, modules = priceIncluded ∪ plan members,
///   StoreRoleFeatures regenerated for inserted modules, PaymentStartDate NEVER touched
/// - Ownership guard: non-owner (another user) → Forbidden; SuperAdmin always allowed
/// - Preconditions: inactive store / inactive owner user → 400; unknown or inactive plan → 400
/// - Override rule: paid target + computed nextDue <= today → NextDueDateOverride = today;
///   paid target + future due → untouched; Gratis target → cleared
/// - Idempotent no-op when already on the target plan
/// </summary>
public class ChangeStorePlanCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
    private readonly Mock<IModuleRepository> _mockModuleRepository;
    private readonly Mock<IFeatureRepository> _mockFeatureRepository;
    private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository;
    private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeaturesGenerator;
    private readonly Mock<IPlanRepository> _mockPlanRepository;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerUserId = Guid.NewGuid();

    private static readonly DateTimeOffset FixedNow = new(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly FixedToday = DateOnly.FromDateTime(FixedNow.UtcDateTime);

    public ChangeStorePlanCommandHandlerTests()
    {
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
        _mockFeatureRepository = new Mock<IFeatureRepository>();
        _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        _mockStoreRoleFeaturesGenerator = new Mock<IStoreRoleFeatureGenerator>();
        _mockPlanRepository = new Mock<IPlanRepository>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();

        _mockLocalizer.Setup(x => x["Forbidden"]).Returns(new LocalizedString("Forbidden", "Forbidden"));
        _mockLocalizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "StoreNotFound"));
        _mockLocalizer.Setup(x => x["StoreInactive"]).Returns(new LocalizedString("StoreInactive", "StoreInactive"));
        _mockLocalizer.Setup(x => x["OwnerUserInactive"]).Returns(new LocalizedString("OwnerUserInactive", "OwnerUserInactive"));
        _mockLocalizer.Setup(x => x["PlanNotFound"]).Returns(new LocalizedString("PlanNotFound", "PlanNotFound"));
        _mockLocalizer.Setup(x => x["PlanInactive"]).Returns(new LocalizedString("PlanInactive", "PlanInactive"));

        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(FixedNow);

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Default: trial 1 month.
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);

        // Default: no previous payments.
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync((StorePayment?)null);
    }

    private ChangeStorePlanCommandHandler CreateHandler()
        => new(
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockModuleRepository.Object,
            _mockFeatureRepository.Object,
            _mockStoreRoleFeatureRepository.Object,
            _mockStoreRoleFeaturesGenerator.Object,
            _mockPlanRepository.Object,
            _mockStorePaymentRepository.Object,
            _mockSystemConfigurationRepository.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object,
            _mockDateTimeProvider.Object);

    // ── Builders ─────────────────────────────────────────────────────────

    private static User CreateActiveUser(Guid userId, Guid tenantId)
    {
        var user = User.Create(userId, "owner", "pass", "Owner User", null, null, tenantId);
        user.IsActive = true;
        return user;
    }

    private Owner CreateActiveOwner()
    {
        var owner = Owner.Create(_ownerUserId, guest: false, _tenantId, "Test Owner");
        owner.User = CreateActiveUser(_ownerUserId, _tenantId);
        return owner;
    }

    private Store CreateStore(DateOnly? paymentStartDate = null, bool isActive = true, Owner? owner = null)
    {
        var store = Store.Create("Test Store", Guid.NewGuid(), true, _tenantId, paymentStartDate);
        typeof(Store).GetProperty("Id")!.SetValue(store, _storeId);
        store.Owner = owner ?? CreateActiveOwner();
        store.IsActive = isActive;
        store.StoreModules = new List<StoreModule>();
        return store;
    }

    private static StoreModule CreateFreeModule(Guid storeId, int moduleId, Guid tenantId)
        => StoreModule.Create(storeId, moduleId, price: 0f, modulePriceIncluded: true,
            modulePrice: 0f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, tenantId);

    private static StoreModule CreatePaidModule(Guid storeId, int moduleId, float price, Guid tenantId, bool isActive = true)
    {
        var sm = StoreModule.Create(storeId, moduleId, price, modulePriceIncluded: false,
            modulePrice: price, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, tenantId);
        sm.IsActive = isActive;
        return sm;
    }

    private static Module CreateCatalogModule(int moduleId, bool priceIncluded, float price)
        => Module.Create(moduleId, $"Module-{moduleId}", order: 1, priceIncluded, price,
            discountPrice: 0f, percentDiscountPrice: 0f, availableToStore: true, isActive: true);

    private static StorePlan CreatePlan(int id, string name, int order, params Module[] modules)
    {
        var plan = StorePlan.Create(id, name, order, isActive: true);
        plan.StorePlanModules = modules
            .Select(m =>
            {
                var spm = StorePlanModule.Create(id, m.Id);
                spm.Module = m;
                return spm;
            })
            .ToList();
        return plan;
    }

    // ── Arrange helpers ──────────────────────────────────────────────────

    private void ArrangeOwnerCaller()
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_ownerUserId.ToString());
    }

    /// <summary>
    /// Mocks the catalog + universe lookups so ApplyPlanModules finds every module it needs:
    /// priceIncluded catalog = [module 1], GetModulesByIdsAsync(universe) returns all built modules.
    /// </summary>
    private void ArrangeUniverse(params Module[] universeModules)
    {
        ArrangeEmptyFeatureBookkeeping();
        var freeCatalogModule = CreateCatalogModule(1, priceIncluded: true, price: 0f);
        _mockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module> { freeCatalogModule }.Concat(universeModules).ToList());
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Module> { freeCatalogModule }.Concat(universeModules).ToList());
        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(new List<StoreModule>());
    }

    private void ArrangeSuperAdmin()
        => _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);

    private void ArrangeAnotherUserCaller()
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
    }

    private void ArrangeStoreFetch(Store store)
    {
        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(_storeId))
            .ReturnsAsync(store);
        _mockStoreRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Store>()))
            .ReturnsAsync(true);
    }

    private void ArrangePlanFetch(StorePlan plan)
        => _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(plan.Id))
            .ReturnsAsync(plan);

    private void ArrangeEmptyFeatureBookkeeping()
    {
        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int>());
        _mockStoreRoleFeaturesGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());
        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());
        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Module>());
    }

    // ── T2.1: guards ─────────────────────────────────────────────────────

    [Fact]
    public async Task Handle_ownerChangesPlan_writesStorePlanId_andNeverTouchesAnchor()
    {
        // Arrange: store on Gratis (plan 1) with the free module active; owner switches to plan 2.
        var anchor = new DateOnly(2026, 1, 10);
        var store = CreateStore(paymentStartDate: anchor);
        store.StorePlanId = 1;
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeUniverse(paidModule);

        // Act
        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        store.StorePlanId.Should().Be(2);
        store.PaymentStartDate.Should().Be(anchor, "the billing anchor is sacred");
    }

    [Fact]
    public async Task Handle_nonOwner_returns403_forbidden()
    {
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 10));
        store.StorePlanId = 1;

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeAnotherUserCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeEmptyFeatureBookkeeping();

        var act = () => CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
        store.StorePlanId.Should().Be(1, "nothing changed");
    }

    [Fact]
    public async Task Handle_superAdmin_canChangeAnyStorePlan()
    {
        var anchor = new DateOnly(2026, 1, 10);
        var store = CreateStore(paymentStartDate: anchor);
        store.StorePlanId = 1;

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeUniverse(paidModule);

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.StorePlanId.Should().Be(2);
        store.PaymentStartDate.Should().Be(anchor);
    }

    [Fact]
    public async Task Handle_unknownPlan_returns400()
    {
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 10));
        store.StorePlanId = 1;

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(99))
            .ReturnsAsync((StorePlan?)null);

        var act = () => CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 99), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_inactiveStore_returns400()
    {
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 10), isActive: false);
        store.StorePlanId = 1;

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);

        var act = () => CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_inactiveOwnerUser_returns400()
    {
        var owner = CreateActiveOwner();
        owner.User.IsActive = false;
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 10), owner: owner);
        store.StorePlanId = 1;

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);

        var act = () => CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_storeNotFound_returns400()
    {
        ArrangeOwnerCaller();
        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(_storeId))
            .ReturnsAsync((Store?)null);

        var act = () => CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_samePlan_isIdempotentNoOp()
    {
        var anchor = new DateOnly(2026, 1, 10);
        var store = CreateStore(paymentStartDate: anchor);
        store.StorePlanId = 2;
        store.StoreModules.Add(CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId));

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeEmptyFeatureBookkeeping();

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.StorePlanId.Should().Be(2);
        store.PaymentStartDate.Should().Be(anchor);
        store.NextDueDateOverride.Should().BeNull();
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never,
            "a same-plan call must not even hit the database");
    }

    // ── T2.2: membership modules ─────────────────────────────────────────

    [Fact]
    public async Task Handle_membership_universeIsFreeIncludedPlusPlanMembers()
    {
        // Arrange: store has only the free module. Target plan carries module 2 (new) and
        // module 3 (soft-deleted on the store). Expect: free kept, 2 inserted, 3 reactivated,
        // and NO leftover paid modules outside the universe.
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 10));
        store.StorePlanId = 1;
        var freeModuleOnStore = CreateFreeModule(_storeId, moduleId: 1, _tenantId);
        var stalePaidModule = CreatePaidModule(_storeId, moduleId: 4, price: 50f, _tenantId); // stale paid module — outside universe
        store.StoreModules.Add(freeModuleOnStore);
        store.StoreModules.Add(stalePaidModule);
        var softDeleted = CreatePaidModule(_storeId, moduleId: 3, price: 300f, _tenantId, isActive: false);

        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(new List<StoreModule> { freeModuleOnStore, stalePaidModule, softDeleted });

        var planModules = new List<Module>
        {
            CreateCatalogModule(2, priceIncluded: false, price: 100f),
            CreateCatalogModule(3, priceIncluded: false, price: 300f),
        };
        var targetPlan = CreatePlan(2, "Pago", order: 2, planModules.ToArray());

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeEmptyFeatureBookkeeping();
        var freeCatalogModule = CreateCatalogModule(1, priceIncluded: true, price: 0f);
        // Catalog: free module 1 (priceIncluded) + paid modules 2/3/4 (paid ones only enter
        // the universe through plan membership).
        _mockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module> { freeCatalogModule }
                .Concat(planModules)
                .Concat(new[] { CreateCatalogModule(4, priceIncluded: false, price: 50f) })
                .ToList());
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Module> { freeCatalogModule }.Concat(planModules).ToList());
        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.Is<List<int>>(l => l.Contains(2))))
            .ReturnsAsync(new List<int> { 21 });

        // Act
        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        // Insert of module 2 (new to the store)
        _mockStoreModuleRepository.Verify(
            x => x.AddAsync(It.Is<StoreModule>(sm => sm.ModuleId == 2)), Times.Once);

        // Reactivation of module 3 (existing but soft-deleted)
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 3 && sm.IsActive)), Times.Once);

        // Stale paid module 4 (active, outside universe) is soft-deleted
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 4 && !sm.IsActive)), Times.Once);

        // Free module 1 is untouched
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 1)), Times.Never);

        // StoreRoleFeatures regenerated for the inserted module
        _mockStoreRoleFeaturesGenerator.Verify(
            x => x.GenerateStoreRoleFeaturesAsync(_storeId, _tenantId, It.Is<List<int>>(l => l.Contains(21))), Times.Once);
    }

    // ── T2.3: anchor + override rule ─────────────────────────────────────

    [Fact]
    public async Task Handle_paidTarget_overdue_setsOverrideToToday()
    {
        // Anchor far in the past + trial 1 → computed nextDue long overdue → override = today.
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 1));
        store.StorePlanId = 1;

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeUniverse(paidModule);

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.NextDueDateOverride.Should().Be(FixedToday, "overdue store switching to a paid plan pays from today");
    }

    [Fact]
    public async Task Handle_paidTarget_futureDue_leavesOverrideUntouched()
    {
        // Anchor yesterday + trial 1 → nextDue far in the future → no override.
        var store = CreateStore(paymentStartDate: FixedToday.AddDays(-1));
        store.StorePlanId = 1;

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var targetPlan = CreatePlan(2, "Pago", order: 2, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(targetPlan);
        ArrangeUniverse(paidModule);

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 2), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.NextDueDateOverride.Should().BeNull();
    }

    [Fact]
    public async Task Handle_paidTarget_vipPlan_followsPaidRule()
    {
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 1));
        store.StorePlanId = 1;

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var vipPlan = CreatePlan(4, "VIP", order: 4, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(vipPlan);
        ArrangeUniverse(paidModule);

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 4), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.StorePlanId.Should().Be(4);
        store.NextDueDateOverride.Should().Be(FixedToday);
    }

    [Fact]
    public async Task Handle_gratisTarget_clearsOverride()
    {
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 1));
        store.StorePlanId = 2;
        store.NextDueDateOverride = new DateOnly(2026, 7, 1);
        store.StoreModules.Add(CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId));
        var paidModuleOnStore = store.StoreModules.Last();
        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(new List<StoreModule> { CreateFreeModule(_storeId, 1, _tenantId), paidModuleOnStore });

        var gratisPlan = CreatePlan(1, "Gratis", order: 1);
        var freeModule = CreateCatalogModule(1, priceIncluded: true, price: 0f);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(gratisPlan);
        ArrangeEmptyFeatureBookkeeping();
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Module> { freeModule });
        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 1), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.StorePlanId.Should().Be(1);
        store.NextDueDateOverride.Should().BeNull("downgrading to Gratis clears any pinned due date");
    }

    [Fact]
    public async Task Handle_paidTarget_usesOverrideAwareComputedDue()
    {
        // Existing override in the future: computed due must respect it, not the raw chain.
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 1, 1));
        store.StorePlanId = 2;
        store.NextDueDateOverride = FixedToday.AddDays(30);

        var paidModule = CreateCatalogModule(2, priceIncluded: false, price: 100f);
        var superiorPlan = CreatePlan(3, "Superior", order: 3, paidModule);

        ArrangeOwnerCaller();
        ArrangeStoreFetch(store);
        ArrangePlanFetch(superiorPlan);
        ArrangeUniverse(paidModule);

        var result = await CreateHandler().Handle(new ChangeStorePlanCommand(_storeId, 3), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        // Future due → the existing override stays untouched (not replaced by today).
        store.NextDueDateOverride.Should().Be(FixedToday.AddDays(30));
    }
}
