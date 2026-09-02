using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.ToggleStorePlan;
using Application.UnitOfWorks;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
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

namespace Application.Tests.Features.StoreManagement.Stores.Commands.ToggleStorePlan;

/// <summary>
/// Unit tests for ToggleStorePlanCommandHandler covering:
/// - Free→Paid sets PaymentStartDate, inserts/activates paid modules, generates StoreRoleFeatures
/// - Paid→Free nulls PaymentStartDate, soft-deletes paid modules + features; free untouched
/// - Preconditions: inactive store / inactive owner user → 400
/// - ReSeller non-owner → StoreNotFound
/// - Idempotent no-op when already on the target plan
/// </summary>
public class ToggleStorePlanCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
    private readonly Mock<IModuleRepository> _mockModuleRepository;
    private readonly Mock<IFeatureRepository> _mockFeatureRepository;
    private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository;
    private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeaturesGenerator;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _ownerUserId = Guid.NewGuid();
    private readonly Guid _reSellerUserId = Guid.NewGuid();

    private static readonly DateTimeOffset FixedNow = new(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly FixedToday = DateOnly.FromDateTime(FixedNow.UtcDateTime);

    public ToggleStorePlanCommandHandlerTests()
    {
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
        _mockFeatureRepository = new Mock<IFeatureRepository>();
        _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        _mockStoreRoleFeaturesGenerator = new Mock<IStoreRoleFeatureGenerator>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();

        _mockLocalizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "UserNotFound"));
        _mockLocalizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "StoreNotFound"));
        _mockLocalizer.Setup(x => x["StoreInactive"]).Returns(new LocalizedString("StoreInactive", "StoreInactive"));
        _mockLocalizer.Setup(x => x["OwnerUserInactive"]).Returns(new LocalizedString("OwnerUserInactive", "OwnerUserInactive"));

        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(FixedNow);

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
    }

    private ToggleStorePlanCommandHandler CreateHandler()
        => new(
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockModuleRepository.Object,
            _mockFeatureRepository.Object,
            _mockStoreRoleFeatureRepository.Object,
            _mockStoreRoleFeaturesGenerator.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object,
            _mockDateTimeProvider.Object);

    private static User CreateActiveUser(Guid userId, Guid tenantId)
    {
        var user = User.Create(userId, "owner", "pass", "Owner User", null, null, tenantId);
        user.IsActive = true;
        return user;
    }

    private Owner CreateActiveOwner()
    {
        var owner = Owner.Create(Guid.NewGuid(), _ownerUserId, false, _tenantId, "Test Owner");
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

    private static Module CreatePaidCatalogModule(int moduleId, float price)
        => Module.Create(moduleId, $"Module-{moduleId}", order: 1, priceIncluded: false, price,
            discountPrice: 0f, percentDiscountPrice: 0f, availableToStore: true, isActive: true);

    private void ArrangeSuperAdmin()
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);
    }

    private void ArrangeReSeller()
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
    }

    private void ArrangeStoreFetch(Store store, bool reSellerOwns = false)
    {
        _mockStoreRepository
            .Setup(x => x.GetStoreWithModulesAndReSellerOwnerAsync(_storeId))
            .ReturnsAsync(store);
        _mockStoreRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Store>()))
            .ReturnsAsync(true);
        _mockStoreRepository
            .Setup(x => x.IsStoreOwnedByReSellerUserAsync(_storeId, _reSellerUserId))
            .ReturnsAsync(reSellerOwns);
    }

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
    }

    // ── Task 4.1: Free → Paid ───────────────────────────────────────────────

    [Fact]
    public async Task Handle_freeToPaid_setsPaymentStartDate_addsPaidModules_andGeneratesFeatures()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: null);
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);
        ArrangeEmptyFeatureBookkeeping();

        // Catalog: one free module (already active on store) + two paid modules (1 new, 1 soft-deleted).
        var catalog = new List<Module>
        {
            Module.Create(1, "Free", 0, priceIncluded: true, 0f, 0f, 0f, true, true),
            CreatePaidCatalogModule(2, 100f),
            CreatePaidCatalogModule(3, 200f),
        };
        _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);

        store.StoreModules.Add(CreatePaidModule(_storeId, moduleId: 3, price: 200f, _tenantId, isActive: false));

        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(store.StoreModules.ToList());
        StoreModule? insertedPaidModule = null;
        _mockStoreModuleRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .Callback<StoreModule>(sm => insertedPaidModule = sm)
            .ReturnsAsync((StoreModule sm) => sm);
        _mockStoreModuleRepository
            .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync(true);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        store.PaymentStartDate.Should().Be(FixedToday);

        // New paid module inserted (module 2).
        insertedPaidModule.Should().NotBeNull();
        insertedPaidModule!.ModuleId.Should().Be(2);
        insertedPaidModule.IsActive.Should().BeTrue();
        insertedPaidModule.Price.Should().Be(100f);
        // Soft-deleted paid module reactivated, no insert (module 3).
        _mockStoreModuleRepository.Verify(x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 3 && sm.IsActive)), Times.Once);
        _mockStoreModuleRepository.Verify(x => x.AddAsync(It.IsAny<StoreModule>()), Times.Once);
        // Free modules untouched.
        store.StoreModules.Single(sm => sm.ModuleId == 1).IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_freeToPaid_generatesStoreRoleFeatures_forInsertedModules()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: null);
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);

        var catalog = new List<Module> { CreatePaidCatalogModule(2, 100f) };
        _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);

        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(store.StoreModules.ToList());
        _mockStoreModuleRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync((StoreModule sm) => sm);

        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.Is<List<int>>(ids => ids.SequenceEqual(new List<int> { 2 }))))
            .ReturnsAsync(new List<int> { 100, 101 });
        _mockStoreRoleFeaturesGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(_storeId, _tenantId, It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>
            {
                StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 100, _tenantId),
                StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 101, _tenantId),
            });
        _mockStoreRoleFeatureRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreRoleFeature>()))
            .ReturnsAsync((StoreRoleFeature f) => f);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _mockStoreRoleFeaturesGenerator.Verify(
            x => x.GenerateStoreRoleFeaturesAsync(_storeId, _tenantId, It.IsAny<IEnumerable<int>>()), Times.Once);
        _mockStoreRoleFeatureRepository.Verify(
            x => x.AddAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 100)), Times.Once);
        _mockStoreRoleFeatureRepository.Verify(
            x => x.AddAsync(It.Is<StoreRoleFeature>(f => f.FeatureId == 101)), Times.Once);
    }

    // ── Task 4.1: Paid → Free ───────────────────────────────────────────────

    [Fact]
    public async Task Handle_paidToFree_nullsDate_softDeletesPaidModules_andDeactivatesFeatures()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));
        var paidActive = CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId);
        var paidAlsoActive = CreatePaidModule(_storeId, moduleId: 3, price: 200f, _tenantId);
        store.StoreModules.Add(paidActive);
        store.StoreModules.Add(paidAlsoActive);

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);

        _mockStoreModuleRepository
            .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync(true);

        var features = new List<StoreRoleFeature>
        {
            StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 100, _tenantId),
            StoreRoleFeature.Create(_storeId, roleId: 3, featureId: 101, _tenantId),
        };
        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(_storeId, It.IsAny<List<int>>()))
            .ReturnsAsync(features);
        _mockStoreRoleFeatureRepository
            .Setup(x => x.UpdateAsync(It.IsAny<StoreRoleFeature>()))
            .ReturnsAsync(true);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        store.PaymentStartDate.Should().BeNull();
        paidActive.IsActive.Should().BeFalse();
        paidAlsoActive.IsActive.Should().BeFalse();
        // Free module untouched.
        store.StoreModules.Single(sm => sm.ModuleId == 1).IsActive.Should().BeTrue();
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => !sm.ModulePriceIncluded)), Times.Exactly(2));
        // Features deactivated.
        features.Should().OnlyContain(f => !f.IsActive);
    }

    // ── Preconditions ───────────────────────────────────────────────────────

    [Fact]
    public async Task Handle_inactiveStore_throwsStoreInactive()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10), isActive: false);

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ApiException>();
        ex.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        ex.Which.Message.Should().Be("StoreInactive");
    }

    [Fact]
    public async Task Handle_inactiveOwnerUser_throwsOwnerUserInactive()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));
        store.Owner.User.IsActive = false;

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ApiException>();
        ex.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        ex.Which.Message.Should().Be("OwnerUserInactive");
    }

    [Fact]
    public async Task Handle_resellerNotOwningStore_throwsStoreNotFound()
    {
        // Arrange
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));

        ArrangeReSeller();
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());
        ArrangeStoreFetch(store, reSellerOwns: false);

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ApiException>();
        ex.Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        ex.Which.Message.Should().Be("StoreNotFound");
    }

    // ── Idempotent no-op (R4d): paid → free with nothing to deactivate ──────

    [Fact]
    public async Task Handle_paidToFree_withNoActivePaidModules_isNoOpOnModules()
    {
        // Arrange
        // R4d: a paid store with date set but no active paid modules (legacy /
        // already-deactivated) → deactivation path nulls the date and performs
        // zero module/feature mutations. Success, no error.
        var store = CreateStore(paymentStartDate: new DateOnly(2026, 3, 10));
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));
        var inactivePaid = CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId, isActive: false);
        store.StoreModules.Add(inactivePaid);

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);
        ArrangeEmptyFeatureBookkeeping();

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        store.PaymentStartDate.Should().BeNull();
        // No active paid module → no module update issued.
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 2)), Times.Never);
        // No feature bookkeeping performed during the no-op.
        _mockStoreRoleFeatureRepository.Verify(
            x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()), Times.Never);
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_freeToPaid_withAllPaidModulesAlreadyActive_isNoOpOnModules()
    {
        // Arrange
        // Free store (date null) whose paid modules are all already active:
        // activation path sets the date and performs zero module inserts.
        var store = CreateStore(paymentStartDate: null);
        store.StoreModules.Add(CreateFreeModule(_storeId, moduleId: 1, _tenantId));
        var activePaid = CreatePaidModule(_storeId, moduleId: 2, price: 100f, _tenantId);
        store.StoreModules.Add(activePaid);

        ArrangeSuperAdmin();
        ArrangeStoreFetch(store);
        ArrangeEmptyFeatureBookkeeping();

        var catalog = new List<Module> { CreatePaidCatalogModule(2, 100f) };
        _mockModuleRepository.Setup(x => x.GetAvailableModulesToStore()).ReturnsAsync(catalog);

        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(store.StoreModules.ToList());

        var handler = CreateHandler();
        var command = new ToggleStorePlanCommand(_storeId);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        store.PaymentStartDate.Should().Be(FixedToday);
        _mockStoreModuleRepository.Verify(
            x => x.AddAsync(It.IsAny<StoreModule>()), Times.Never);
        _mockStoreModuleRepository.Verify(
            x => x.UpdateAsync(It.Is<StoreModule>(sm => sm.ModuleId == 2)), Times.Never);
        _mockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }
}