using System.Linq.Expressions;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.UpdateStore;
using Application.UnitOfWorks;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.UpdateStore;

/// <summary>
/// Tests for the DG-7 one-way plan lock in UpdateStoreCommandHandler:
/// a non-SuperAdmin caller must not change the module set of a store that
/// has any active paid module. Same-set updates, free-store activation, and
/// SuperAdmin module changes stay allowed.
/// </summary>
public class UpdateStoreCommandHandlerLockTests
{
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IModuleRepository> _mockModuleRepository;
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly Mock<IGetStoreByIdService> _mockStoreByIdService;
    private readonly Mock<IFeatureRepository> _mockFeatureRepository;
    private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeaturesGenerator;
    private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly UpdateStoreCommandHandler _handler;

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();

    public UpdateStoreCommandHandlerLockTests()
    {
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _mockStoreByIdService = new Mock<IGetStoreByIdService>();
        _mockFeatureRepository = new Mock<IFeatureRepository>();
        _mockStoreRoleFeaturesGenerator = new Mock<IStoreRoleFeatureGenerator>();
        _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();

        _mockLocalizer
            .Setup(x => x["PlanLocked"])
            .Returns(new LocalizedString("PlanLocked", "PlanLocked"));

        _handler = new UpdateStoreCommandHandler(
            _mockUnitOfWork.Object,
            _mockStoreRepository.Object,
            _mockModuleRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object,
            _mockStoreByIdService.Object,
            _mockFeatureRepository.Object,
            _mockStoreRoleFeaturesGenerator.Object,
            _mockStoreRoleFeatureRepository.Object,
            _mockDateTimeProvider.Object);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /// <summary>
    /// Wires every downstream repository so the handler can complete the full
    /// mutation path when the lock does NOT fire. Mirrors what the handler
    /// actually calls: duplicate-name check, module catalog, store modules,
    /// role-feature bookkeeping, and SaveChanges.
    /// </summary>
    private void ArrangeDownstream(Store store, List<StoreModule> storeModules, List<int> requestModuleIds)
    {
        _mockStoreRepository
            .Setup(x => x.Where(It.IsAny<Expression<Func<Store, bool>>>()))
            .Returns(new List<Store>().AsQueryable());

        _mockStoreRepository
            .Setup(x => x.UpdateAsync(It.IsAny<Store>()))
            .ReturnsAsync(true);

        // The module catalog query resolves the REQUESTED ids. Use the store's
        // current pricing when present; any requested id not on the store yet is
        // a paid module (module 6 in the DG-7 scenarios).
        var moduleList = requestModuleIds.Select(moduleId =>
        {
            StoreModule? current = storeModules.FirstOrDefault(sm => sm.ModuleId == moduleId);
            bool priceIncluded = current?.ModulePriceIncluded ?? false;
            float price = current?.ModulePrice ?? 100f;
            return Module.Create(
                moduleId,
                $"Module-{moduleId}",
                order: 1,
                priceIncluded,
                price,
                discountPrice: 0f,
                percentDiscountPrice: 0f,
                availableToStore: true,
                isActive: true);
        }).Cast<Module>().ToList();

        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(moduleList);

        _mockStoreModuleRepository
            .Setup(x => x.GetStoreModulesByIdAsync(_storeId))
            .ReturnsAsync(storeModules);

        _mockStoreModuleRepository
            .Setup(x => x.UpdateAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync(true);

        _mockStoreModuleRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync((StoreModule sm) => sm);

        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int>());

        _mockStoreRoleFeaturesGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());

        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllActiveToStoreByStoreIdAndModuleIdsAsync(
                It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());

        _mockStoreRoleFeatureRepository
            .Setup(x => x.GetAllByStoreIdAndModuleIdAndFeatureIdsAsync(
                It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());

        _mockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        _mockDateTimeProvider
            .Setup(x => x.UtcNow)
            .Returns(new DateTimeOffset(2026, 7, 15, 0, 0, 0, TimeSpan.Zero));
    }

    private Store BuildPaidStore()
    {
        var store = Store.Create("Test Store", Guid.NewGuid(), true, _tenantId,
            DateOnly.FromDateTime(DateTime.UtcNow));
        typeof(Store).GetProperty("Id")!.SetValue(store, _storeId);
        store.StoreModules = new List<StoreModule>
        {
            // Free module: Management (id=7), PriceIncluded=true
            StoreModule.Create(_storeId, moduleId: 7, price: 0f, modulePriceIncluded: true,
                modulePrice: 0f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, _tenantId),
            // Paid module: Statistics (id=6), PriceIncluded=false
            StoreModule.Create(_storeId, moduleId: 6, price: 100f, modulePriceIncluded: false,
                modulePrice: 100f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, _tenantId)
        }.ToList();
        return store;
    }

    private Store BuildFreeStore()
    {
        var store = Store.Create("Test Store", Guid.NewGuid(), true, _tenantId, paymentStartDate: null);
        typeof(Store).GetProperty("Id")!.SetValue(store, _storeId);
        store.StoreModules = new List<StoreModule>
        {
            StoreModule.Create(_storeId, moduleId: 7, price: 0f, modulePriceIncluded: true,
                modulePrice: 0f, moduleDiscountPrice: 0f, modulePercentDiscountPrice: 0f, _tenantId)
        }.ToList();
        return store;
    }

    private void ArrangePaidStoreOwnerAdmin(List<int> requestModuleIds)
    {
        var store = BuildPaidStore();
        _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockStoreByIdService.Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId)).ReturnsAsync(store);
        ArrangeDownstream(store, store.StoreModules.ToList(), requestModuleIds);
    }

    private void ArrangeStore(List<int> requestModuleIds, bool superAdmin)
    {
        var store = superAdmin ? BuildPaidStore() : BuildFreeStore();
        _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(superAdmin);
        _mockStoreByIdService.Setup(x => x.GetStoreByIdIncludingModulesAsync(_storeId)).ReturnsAsync(store);
        ArrangeDownstream(store, store.StoreModules.ToList(), requestModuleIds);
    }

    // ── Task 1.1: lock fires ────────────────────────────────────────────────

    [Fact]
    public async Task Handle_OwnerAdminChangesModulesOnPaidStore_ThrowsPlanLocked()
    {
        // Arrange
        var command = new UpdateStoreCommand(
            _storeId, "Renamed", null, null, Approved: false,
            ModuleIds: new List<int> { 7 }, IsActive: true);
        ArrangePaidStoreOwnerAdmin(command.ModuleIds);

        // Act
        Func<Task> act = async () => await _handler.Handle(command, CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.Which.Errors.Should().Contain(e => e.Code == "PlanLocked");
    }

    // ── Task 1.2: no false rejection ────────────────────────────────────────

    [Fact]
    public async Task Handle_OwnerAdminKeepsSameModuleSetOnPaidStore_DoesNotThrow()
    {
        // Arrange
        var command = new UpdateStoreCommand(
            _storeId, "Renamed", null, null, Approved: false,
            ModuleIds: new List<int> { 7, 6 }, IsActive: true);
        ArrangePaidStoreOwnerAdmin(command.ModuleIds);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_OwnerAdminActivatesFreeStore_DoesNotThrow()
    {
        // Arrange
        // Adding the paid Statistics module (id=6) to a free store is activation, not a plan change.
        var command = new UpdateStoreCommand(
            _storeId, "Renamed", null, null, Approved: false,
            ModuleIds: new List<int> { 7, 6 }, IsActive: true);
        ArrangeStore(command.ModuleIds, superAdmin: false);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_SuperAdminChangesModulesOnPaidStore_DoesNotThrow()
    {
        // Arrange
        var command = new UpdateStoreCommand(
            _storeId, "Renamed", null, null, Approved: false,
            ModuleIds: new List<int> { 7 }, IsActive: true);
        ArrangeStore(command.ModuleIds, superAdmin: true);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    // ── Task: data-only update (ModuleIds null) ──────────────────────────────

    [Fact]
    public async Task Handle_OwnerAdminDataOnlyUpdateOnPaidStore_DoesNotFireLockOrTouchModules()
    {
        // The update view saves store data WITHOUT ModuleIds: the DG-7 lock must
        // not fire (no module change is requested) and the module sync must be
        // skipped entirely — the plan is untouched.
        var command = new UpdateStoreCommand(
            _storeId, "Renamed", null, null, Approved: false,
            ModuleIds: null, IsActive: true);
        ArrangePaidStoreOwnerAdmin(new List<int>());

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        _mockStoreModuleRepository.Verify(
            x => x.GetStoreModulesByIdAsync(_storeId), Times.Never);
    }
}