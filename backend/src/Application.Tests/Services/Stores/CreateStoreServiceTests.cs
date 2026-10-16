using Application.Abstractions.Time;
using Application.Services.Stores;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Tenants;
using FluentAssertions;
using Moq;

namespace Application.Tests.Services.Stores;

/// <summary>
/// Unit tests for CreateStoreService covering all scenarios:
/// - Happy Path: Normal store creation flow
/// - Birth plan: store-birth-superior (2026-10-11) — the store lands on Superior and the module
///   set is DERIVED from the Superior plan catalog filtered by IsActive &amp;&amp; AvailableToStore
/// - Edge Cases: empty catalog, various inputs
/// - Error Management: Repository failures
/// - Integration: Mock verification of dependencies
/// </summary>
public class CreateStoreServiceTests
{
    // Mock dependencies
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IPlanRepository> _mockPlanRepository;
    private readonly Mock<IFeatureRepository> _mockFeatureRepository;
    private readonly Mock<IStoreModuleRepository> _mockStoreModuleRepository;
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<IStoreRoleFeatureRepository> _mockStoreRoleFeatureRepository;
    private readonly Mock<IStoreRoleFeatureGenerator> _mockStoreRoleFeatureGenerator;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    // Test data
    private readonly Guid _testOwnerId = Guid.NewGuid();
    private readonly Guid _testTenantId = Guid.NewGuid();
    private readonly Guid _testStoreId = Guid.NewGuid();
    private static readonly DateTimeOffset FixedNow = new(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);

    /// <summary>Module id seeded into the fake Superior catalog (IsActive + AvailableToStore).</summary>
    private const int CatalogModuleId = 7;

    /// <summary>Module id whose catalog row exists but which is NOT AvailableToStore.</summary>
    private const int NotAvailableModuleId = 8;

    /// <summary>Module id whose catalog row exists but which is NOT IsActive.</summary>
    private const int InactiveModuleId = 9;

    public CreateStoreServiceTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockPlanRepository = new Mock<IPlanRepository>();
        _mockFeatureRepository = new Mock<IFeatureRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        _mockStoreRoleFeatureGenerator = new Mock<IStoreRoleFeatureGenerator>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        // Default successful setups
        SetupDefaultSuccessfulScenarios();
    }

    private CreateStoreService CreateService()
    {
        return new CreateStoreService(
            _mockStoreRepository.Object,
            _mockPlanRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockOwnerRepository.Object,
            _mockStoreFeatureRepository.Object,
            _mockStoreRoleFeatureGenerator.Object,
            _mockFeatureRepository.Object,
            _mockDateTimeProvider.Object);
    }

    /// <summary>
    /// The active Superior plan, with the Module navigation loaded exactly the way
    /// <c>PlanRepository.GetActivePlanWithModulesByIdAsync</c> loads it. Catalog flags live on the
    /// Module, so the filter under test is exercised through real Module rows.
    /// </summary>
    private static StorePlan CreateSuperiorPlan(bool includeCatalogModule = true, bool includeNotAvailable = true, bool includeInactive = true)
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        if (includeCatalogModule)
            plan.StorePlanModules.Add(NewCatalogEntry(plan.Id, CatalogModuleId, isActive: true, availableToStore: true));
        if (includeNotAvailable)
            plan.StorePlanModules.Add(NewCatalogEntry(plan.Id, NotAvailableModuleId, isActive: true, availableToStore: false));
        if (includeInactive)
            plan.StorePlanModules.Add(NewCatalogEntry(plan.Id, InactiveModuleId, isActive: false, availableToStore: true));
        return plan;
    }

    private static StorePlanModule NewCatalogEntry(int planId, int moduleId, bool isActive, bool availableToStore,
        float price = 100f, float percentDiscountPrice = 0f)
    {
        var module = Module.Create(moduleId, $"Test Module {moduleId}", 1, priceIncluded: false,
            price: price, discountPrice: 0, percentDiscountPrice: percentDiscountPrice, availableToStore: availableToStore,
            isActive: isActive);
        var entry = StorePlanModule.Create(planId, moduleId);
        entry.Module = module;
        return entry;
    }

    /// <summary>
    /// A Superior plan carrying ONLY the given members, each with a real catalog price/percent
    /// discount. Used by the additional-store rule tests, which need MultiStores (14) in the
    /// catalog with its actual snapshot values instead of the fixed test module.
    /// </summary>
    private static StorePlan CreateSuperiorPlanWith(params (int ModuleId, float Price, float PercentDiscount)[] members)
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        foreach (var m in members)
            plan.StorePlanModules.Add(NewCatalogEntry(plan.Id, m.ModuleId, isActive: true,
                availableToStore: true, price: m.Price, percentDiscountPrice: m.PercentDiscount));
        return plan;
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        // Store repository setup
        _mockStoreRepository
            .Setup(x => x.AddAsync(It.IsAny<Store>()))
            .ReturnsAsync((Store s) => s);

        // Default: the owner has NO other store, so birth behaves exactly as before the
        // additional-store MultiStores rule. Tests for that rule override this.
        _mockStoreRepository
            .Setup(x => x.HasAnyStoreByOwnerIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(false);

        // Date time provider setup — mandatory: an unconfigured Mock<IDateTimeProvider>.UtcNow
        // returns default(DateTimeOffset) (0001-01-01), which would silently poison every other
        // test in this file that does not care about the clock.
        _mockDateTimeProvider
            .Setup(x => x.UtcNow)
            .Returns(FixedNow);

        // Plan repository setup — the birth plan is ALWAYS Superior (store-birth-superior).
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ReturnsAsync(CreateSuperiorPlan());

        // Feature repository setup
        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int> { 1, 2, 3 });

        // Store module repository setup
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Returns(Task.CompletedTask);

        // Store role feature generator setup
        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>());
    }

    // Rename to avoid conflict
    private Mock<IStoreRoleFeatureRepository> _mockStoreFeatureRepository => _mockStoreRoleFeatureRepository;

    #region Constructor Tests

    [Fact]
    public void Constructor_ShouldNotThrow_WhenAllDependenciesAreProvided()
    {
        // Act
        var action = () => CreateService();

        // Assert
        action.Should().NotThrow();
    }

    #endregion

    #region Happy Path Tests

    [Fact]
    public async Task CreateStoreAsync_ShouldReturnStore_WhenAllParametersAreValid()
    {
        // Arrange
        var service = CreateService();
        var name = "Test Store";
        var address = "123 Main St";
        var description = "Test Description";

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            name,
            address,
            description,
            approved: false);

        // Assert
        result.Should().NotBeNull();
        result.Name.Should().Be(name);
        result.Address.Should().Be(address);
        result.Description.Should().Be(description);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldSetPaymentStartDate_ToProviderToday()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        result.PaymentStartDate.Should().Be(DateOnly.FromDateTime(FixedNow.UtcDateTime));
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldUseProviderClock_NotWallClock()
    {
        // Arrange
        var distinctInstant = new DateTimeOffset(2030, 11, 20, 0, 0, 0, TimeSpan.Zero);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(distinctInstant);
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        result.PaymentStartDate.Should().Be(DateOnly.FromDateTime(distinctInstant.UtcDateTime));
        result.PaymentStartDate.Should().NotBe(DateOnly.FromDateTime(FixedNow.UtcDateTime));
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldGenerateStoreRoleFeatures()
    {
        // Arrange
        var service = CreateService();

        // Use reflection to create StoreRoleFeature instances since there's no public constructor
        var generatedFeatures = CreateTestStoreRoleFeatures();

        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(generatedFeatures);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        _mockStoreRoleFeatureGenerator.Verify(x => x.GenerateStoreRoleFeaturesAsync(
            It.IsAny<Guid>(),
            _testTenantId,
            It.IsAny<IEnumerable<int>>()),
            Times.Once);
    }

    private List<StoreRoleFeature> CreateTestStoreRoleFeatures()
    {
        var storeId = Guid.NewGuid();
        var tenantId = Guid.NewGuid();
        
        var feature1 = StoreRoleFeature.Create(storeId, 2, 1, tenantId);
        var feature2 = StoreRoleFeature.Create(storeId, 2, 2, tenantId);
        
        return new List<StoreRoleFeature> { feature1, feature2 };
    }

    #endregion

    #region Birth plan — store-birth-superior (2026-10-11)

    [Fact]
    public async Task CreateStoreAsync_ShouldCreateStore_OnSuperiorPlan()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert
        result.StorePlanId.Should().Be((int)StorePlanType.Superior);
        _mockPlanRepository.Verify(
            x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior), Times.Once);
        _mockPlanRepository.Verify(
            x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()), Times.Once,
            "the birth plan is Superior and nothing else — no caller-chosen plan.");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldGrantExactlyTheActiveAvailableSuperiorCatalogMembers()
    {
        // Arrange: catalog = {7 ok, 8 NOT AvailableToStore, 9 NOT IsActive}.
        var service = CreateService();
        List<StoreModule> granted = new List<StoreModule>();
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(m => granted = m.ToList())
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert
        granted.Select(sm => sm.ModuleId).Should().BeEquivalentTo(new[] { CatalogModuleId },
            "only catalog members that are IsActive AND AvailableToStore are granted");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldSnapshotCatalogPrice_OnEveryGrantedStoreModule()
    {
        // Arrange
        var service = CreateService();
        List<StoreModule> granted = new List<StoreModule>();
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(m => granted = m.ToList())
            .Returns(Task.CompletedTask);

        // Act
        var store = await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert
        var module = granted.Single();
        module.ModulePrice.Should().Be(100f);
        module.ModulePriceIncluded.Should().BeFalse();
        module.ModuleDiscountPrice.Should().Be(0f);
        module.ModulePercentDiscountPrice.Should().Be(0f);
        module.StoreId.Should().Be(store.Id);
        module.TenantId.Should().Be(_testTenantId);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldResolveFeaturesForTheGrantedModulesOnly()
    {
        // Arrange
        var service = CreateService();

        // Act
        await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert
        _mockFeatureRepository.Verify(
            x => x.GetAvailableFeatureIdsByModuleIdsAsync(
                It.Is<List<int>>(ids => ids.SequenceEqual(new List<int> { CatalogModuleId }))),
            Times.Once);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldGrantNothing_WhenSuperiorPlanHasNoEligibleMembers()
    {
        // Arrange: a plan whose only members are inactive or not available to stores.
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ReturnsAsync(CreateSuperiorPlan(
                includeCatalogModule: false, includeNotAvailable: false, includeInactive: false));
        var service = CreateService();

        // Act
        var store = await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert — the store still lands on Superior; it just carries no billable module.
        store.StorePlanId.Should().Be((int)StorePlanType.Superior);
        _mockStoreModuleRepository.Verify(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()), Times.Never);
        _mockFeatureRepository.Verify(
            x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()), Times.Once);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldGrantNothing_WhenTheBirthPlanIsNotActive()
    {
        // Arrange: GetActivePlanWithModulesByIdAsync filters on IsActive, so an inactive Superior
        // plan comes back null — the same production shape as a missing plan.
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ReturnsAsync((StorePlan?)null);
        var service = CreateService();

        // Act
        var store = await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Store", null, null, false);

        // Assert — no silent crash, and no module outside the (absent) catalog.
        store.StorePlanId.Should().Be((int)StorePlanType.Superior);
        _mockStoreModuleRepository.Verify(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()), Times.Never);
    }

    #endregion

    #region Additional store — MultiStores charged once (owner decision 2026-10-16)

    private const int MultiStoresModuleId = (int)ModuleType.MultiStores;
    private const int OtherPaidModuleId = 6;

    [Fact]
    public async Task CreateStoreAsync_OnAdditionalStore_GrantsMultiStoresAt100PercentDiscount()
    {
        // Arrange: the owner already has a store, so the new one is an ADDITIONAL store.
        _mockStoreRepository
            .Setup(x => x.HasAnyStoreByOwnerIdAsync(_testOwnerId))
            .ReturnsAsync(true);
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ReturnsAsync(CreateSuperiorPlanWith(
                (MultiStoresModuleId, 5f, 50f),
                (OtherPaidModuleId, 100f, 25f)));
        var service = CreateService();
        List<StoreModule> granted = new();
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(m => granted = m.ToList())
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(_testOwnerId, _testTenantId, "Second Store", null, null, false);

        // Assert: MultiStores pays 0 on that store...
        var multiStores = granted.Single(sm => sm.ModuleId == MultiStoresModuleId);
        multiStores.ModulePercentDiscountPrice.Should().Be(100f);
        multiStores.ModulePrice.Should().Be(5f, "only the discount changes, never the catalog price");

        // ...and no OTHER module is touched.
        var other = granted.Single(sm => sm.ModuleId == OtherPaidModuleId);
        other.ModulePercentDiscountPrice.Should().Be(25f);
    }

    [Fact]
    public async Task CreateStoreAsync_OnFirstStore_KeepsMultiStoresCatalogDiscount()
    {
        // Arrange: the owner has no store yet — this is the FIRST one, so nothing is discounted.
        _mockStoreRepository
            .Setup(x => x.HasAnyStoreByOwnerIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(false);
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ReturnsAsync(CreateSuperiorPlanWith((MultiStoresModuleId, 5f, 50f)));
        var service = CreateService();
        List<StoreModule> granted = new();
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(m => granted = m.ToList())
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(_testOwnerId, _testTenantId, "First Store", null, null, false);

        // Assert
        granted.Single().ModulePercentDiscountPrice.Should().Be(50f,
            "the MultiStores discount only kicks in for an ADDITIONAL store");
    }

    #endregion

    #region Edge Cases Tests

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleNullAddress()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        result.Should().NotBeNull();
        result.Address.Should().BeNull();
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleNullDescription()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            "123 Main St",
            null,
            false);

        // Assert
        result.Should().NotBeNull();
        result.Description.Should().BeNull();
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleApprovedTrue()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            approved: true);

        // Assert
        result.Should().NotBeNull();
        result.Approved.Should().BeTrue();
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleApprovedFalse()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            approved: false);

        // Assert
        result.Should().NotBeNull();
        result.Approved.Should().BeFalse();
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleSpecialCharactersInName()
    {
        // Arrange
        var service = CreateService();
        var storeName = "Tienda de José & María - Store #1";

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            storeName,
            null,
            null,
            false);

        // Assert
        result.Should().NotBeNull();
        result.Name.Should().Be(storeName);
    }

    #endregion

    #region Error Management Tests

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenStoreRepositoryFails()
    {
        // Arrange
        _mockStoreRepository
            .Setup(x => x.AddAsync(It.IsAny<Store>()))
            .ThrowsAsync(new InvalidOperationException("Store creation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Store creation failed");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenPlanRepositoryFails()
    {
        // Arrange
        _mockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior))
            .ThrowsAsync(new InvalidOperationException("Plan query failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Plan query failed");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenFeatureRepositoryFails()
    {
        // Arrange
        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
            .ThrowsAsync(new InvalidOperationException("Feature query failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Feature query failed");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenStoreModuleRepositoryFails()
    {
        // Arrange
        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .ThrowsAsync(new InvalidOperationException("StoreModule creation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("StoreModule creation failed");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenStoreRoleFeatureGeneratorFails()
    {
        // Arrange
        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ThrowsAsync(new InvalidOperationException("Feature generation failed"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Feature generation failed");
    }

    #endregion

    #region Bug Fix Verification Tests

    /// <summary>
    /// VERIFICATION TEST: After fixing the ForEach(async...) anti-pattern to use
    /// Task.WhenAll(), this test verifies that all StoreRoleFeatures are properly added.
    /// 
    /// FIX: Changed from:
    ///   storeRoleFeatures.ForEach(async srf => await _storeRoleFeatureRepository.AddAsync(srf));
    /// 
    /// TO:
    ///   await Task.WhenAll(storeRoleFeatures.Select(srf => _storeRoleFeatureRepository.AddAsync(srf)));
    /// </summary>
    [Fact]
    public async Task CreateStoreAsync_ShouldAddAllStoreRoleFeatures_WithCorrectCount()
    {
        // Arrange
        var service = CreateService();
        var storeRoleFeatures = new List<StoreRoleFeature>
        {
            StoreRoleFeature.Create(_testStoreId, 2, 1, _testTenantId),
            StoreRoleFeature.Create(_testStoreId, 2, 2, _testTenantId),
            StoreRoleFeature.Create(_testStoreId, 2, 3, _testTenantId)
        };

        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(storeRoleFeatures);

        var addCallCount = 0;
        _mockStoreRoleFeatureRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreRoleFeature>>()))
            .Callback<IEnumerable<StoreRoleFeature>>(features =>
            {
                foreach (var _ in features)
                {
                    Interlocked.Increment(ref addCallCount);
                }
            })
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert - With Task.WhenAll, all calls should complete
        addCallCount.Should().Be(3, "All StoreRoleFeatures should be added");
    }

    /// <summary>
    /// VERIFICATION TEST: Verifies that the service properly awaits all async operations.
    /// </summary>
    [Fact]
    public async Task CreateStoreAsync_ShouldProperlyAwaitAllStoreRoleFeatureAdds()
    {
        // Arrange
        var service = CreateService();
        var callOrder = new List<string>();

        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<StoreRoleFeature>
            {
                StoreRoleFeature.Create(_testStoreId, 2, 1, _testTenantId),
                StoreRoleFeature.Create(_testStoreId, 2, 2, _testTenantId)
            });

        _mockStoreRoleFeatureRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreRoleFeature>>()))
            .Callback(() => callOrder.Add("AddRangeAsync"))
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        _mockStoreRoleFeatureRepository.Verify(
            x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreRoleFeature>>()), 
            Times.Once);
    }

    #endregion

    #region Integration Tests (Mock Verification)

    [Fact]
    public async Task CreateStoreAsync_ShouldCallStoreRepository_WithCorrectParameters()
    {
        // Arrange
        var service = CreateService();
        var storeName = "My Store";

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            storeName,
            null,
            null,
            false);

        // Assert
        _mockStoreRepository.Verify(x => x.AddAsync(
            It.Is<Store>(s => 
                s.Name == storeName && 
                s.OwnerId == _testOwnerId &&
                s.TenantId == _testTenantId)),
            Times.Once);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldSetCorrectTenantId_OnStoreModules()
    {
        // Arrange
        var service = CreateService();
        StoreModule? capturedStoreModule = null;

        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(modules => capturedStoreModule = modules.First())
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        capturedStoreModule.Should().NotBeNull();
        capturedStoreModule!.TenantId.Should().Be(_testTenantId);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldSetCorrectStoreId_OnStoreModules()
    {
        // Arrange
        var service = CreateService();
        StoreModule? capturedStoreModule = null;

        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(modules => capturedStoreModule = modules.First())
            .Returns(Task.CompletedTask);

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        capturedStoreModule.Should().NotBeNull();
        capturedStoreModule!.StoreId.Should().Be(result.Id);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCallStoreRoleFeatureGenerator_WithStoreId()
    {
        // Arrange
        var service = CreateService();
        Guid? capturedStoreId = null;

        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .Callback<Guid, Guid, IEnumerable<int>>((storeId, tenantId, featureIds) => capturedStoreId = storeId)
            .ReturnsAsync(new List<StoreRoleFeature>());

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        capturedStoreId.Should().NotBeNull();
        capturedStoreId.Should().Be(result.Id);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldReturnStoreWithCorrectOwnerId()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        result.OwnerId.Should().Be(_testOwnerId);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldReturnStoreWithCorrectTenantId()
    {
        // Arrange
        var service = CreateService();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        result.TenantId.Should().Be(_testTenantId);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCreateStoreBeforeStoreModules()
    {
        // Arrange
        var service = CreateService();
        var callOrder = new List<string>();

        _mockStoreRepository
            .Setup(x => x.AddAsync(It.IsAny<Store>()))
            .Callback(() => callOrder.Add("Store"))
            .ReturnsAsync((Store s) => s);

        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback(() => callOrder.Add("StoreModule"))
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false);

        // Assert
        callOrder.IndexOf("Store").Should().BeLessThan(callOrder.IndexOf("StoreModule"),
            "Store should be created before StoreModules");
    }

    #endregion
}