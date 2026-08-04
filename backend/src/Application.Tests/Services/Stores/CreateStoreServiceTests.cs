using Application.Abstractions.Time;
using Application.Services.Stores;
using Domain.Entities.Features;
using Domain.Entities.Modules;
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
/// - Edge Cases: Empty module lists, various inputs
/// - Error Management: Repository failures
/// - Integration: Mock verification of dependencies
/// </summary>
public class CreateStoreServiceTests
{
    // Mock dependencies
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IModuleRepository> _mockModuleRepository;
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

    public CreateStoreServiceTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
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
            _mockModuleRepository.Object,
            _mockStoreModuleRepository.Object,
            _mockOwnerRepository.Object,
            _mockStoreFeatureRepository.Object,
            _mockStoreRoleFeatureGenerator.Object,
            _mockFeatureRepository.Object,
            _mockDateTimeProvider.Object);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        // Store repository setup
        _mockStoreRepository
            .Setup(x => x.AddAsync(It.IsAny<Store>()))
            .ReturnsAsync((Store s) => s);

        // Date time provider setup — mandatory: an unconfigured Mock<IDateTimeProvider>.UtcNow
        // returns default(DateTimeOffset) (0001-01-01), which would silently poison every other
        // test in this file that does not care about the clock.
        _mockDateTimeProvider
            .Setup(x => x.UtcNow)
            .Returns(FixedNow);

        // Module repository setup - returns valid modules by ids
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync((IEnumerable<int> ids) => ids.Select(id => Module.Create(
                id: id,
                name: "Test Module",
                order: 1,
                priceIncluded: true,
                price: 100f,
                availableToStore: true,
                isActive: true)));

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
        var moduleIds = new List<int> { 1, 2 };

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            name,
            address,
            description,
            approved: false,
            moduleIds);

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

        // Assert
        result.PaymentStartDate.Should().Be(DateOnly.FromDateTime(distinctInstant.UtcDateTime));
        result.PaymentStartDate.Should().NotBe(DateOnly.FromDateTime(FixedNow.UtcDateTime));
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCreateStoreModules_ForEachModuleId()
    {
        // Arrange
        var service = CreateService();
        var moduleIds = new List<int> { 1, 2, 3 };
        var callCount = 0;

        _mockStoreModuleRepository
            .Setup(x => x.AddRangeAsync(It.IsAny<IEnumerable<StoreModule>>()))
            .Callback<IEnumerable<StoreModule>>(modules => callCount = modules.Count())
            .Returns(Task.CompletedTask);

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            moduleIds);

        // Assert
        callCount.Should().Be(moduleIds.Count);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldGenerateStoreRoleFeatures()
    {
        // Arrange
        var service = CreateService();
        var featureIds = new List<int> { 1, 2, 3 };

        // Use reflection to create StoreRoleFeature instances since there's no public constructor
        var generatedFeatures = CreateTestStoreRoleFeatures();

        _mockStoreRoleFeatureGenerator
            .Setup(x => x.GenerateStoreRoleFeaturesAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(generatedFeatures);

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            new List<int> { 1 });

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

    #region Edge Cases Tests

    [Fact]
    public async Task CreateStoreAsync_ShouldHandleEmptyModuleIdsList()
    {
        // Arrange
        var service = CreateService();
        var emptyModuleIds = new List<int>();

        // Act
        var result = await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            emptyModuleIds);

        // Assert
        result.Should().NotBeNull();
        _mockStoreModuleRepository.Verify(x => x.AddAsync(It.IsAny<StoreModule>()), Times.Never);
    }

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            approved: true,
            new List<int> { 1 });

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
            approved: false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Store creation failed");
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenModuleRepositoryFails()
    {
        // Arrange
        _mockModuleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ThrowsAsync(new InvalidOperationException("Module not found"));

        var service = CreateService();

        // Act
        Func<Task> act = async () => await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            new List<int> { 1, 2 });

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Module not found");
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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

        // Assert
        _mockStoreRepository.Verify(x => x.AddAsync(
            It.Is<Store>(s => 
                s.Name == storeName && 
                s.OwnerId == _testOwnerId &&
                s.TenantId == _testTenantId)),
            Times.Once);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCallModuleRepository_ForEachModuleId()
    {
        // Arrange
        var service = CreateService();
        var moduleIds = new List<int> { 1, 2, 3 };

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            moduleIds);

        // Assert
        _mockModuleRepository.Verify(
            x => x.GetModulesByIdsAsync(It.Is<IEnumerable<int>>(ids => ids.SequenceEqual(moduleIds))),
            Times.Once);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCallFeatureRepository_WithModuleIds()
    {
        // Arrange
        var service = CreateService();
        var moduleIds = new List<int> { 1, 2, 3 };

        // Act
        await service.CreateStoreAsync(
            _testOwnerId,
            _testTenantId,
            "Store",
            null,
            null,
            false,
            moduleIds);

        // Assert
        _mockFeatureRepository.Verify(x => x.GetAvailableFeatureIdsByModuleIdsAsync(moduleIds),
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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

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
            false,
            new List<int> { 1 });

        // Assert
        callOrder.IndexOf("Store").Should().BeLessThan(callOrder.IndexOf("StoreModule"),
            "Store should be created before StoreModules");
    }

    #endregion
}
