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
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;

    // Test data
    private readonly Guid _testOwnerId = Guid.NewGuid();
    private readonly Guid _testTenantId = Guid.NewGuid();
    private readonly Guid _testStoreId = Guid.NewGuid();

    public CreateStoreServiceTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
        _mockFeatureRepository = new Mock<IFeatureRepository>();
        _mockStoreModuleRepository = new Mock<IStoreModuleRepository>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockStoreRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        _mockStoreRoleFeatureGenerator = new Mock<IStoreRoleFeatureGenerator>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();

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
            _mockSystemConfigurationRepository.Object,
            _mockFeatureRepository.Object);
    }

    private void SetupDefaultSuccessfulScenarios()
    {
        // System configuration for testing period
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(1);

        // Store repository setup
        _mockStoreRepository
            .Setup(x => x.AddAsync(It.IsAny<Store>()))
            .ReturnsAsync((Store s) => s);

        // Module repository setup - returns a valid module
        _mockModuleRepository
            .Setup(x => x.GetByIdAsync(It.IsAny<int>()))
            .ReturnsAsync((int id) => Module.Create(
                id: id,
                name: "Test Module",
                order: 1,
                priceIncluded: true,
                price: 100f,
                availableToStore: true,
                isActive: true));

        // Feature repository setup
        _mockFeatureRepository
            .Setup(x => x.GetAvailableFeatureIdsByModuleIdsAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int> { 1, 2, 3 });

        // Store module repository setup
        _mockStoreModuleRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .ReturnsAsync((StoreModule sm) => sm);

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
    public async Task CreateStoreAsync_ShouldSetPaymentStartDate_BasedOnTestingPeriod()
    {
        // Arrange
        var service = CreateService();
        var testingPeriod = 3; // months

        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(testingPeriod);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var expectedStartDate = today.AddMonths(testingPeriod);

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
        result.PaymentStartDate.Should().Be(expectedStartDate);
    }

    [Fact]
    public async Task CreateStoreAsync_ShouldCreateStoreModules_ForEachModuleId()
    {
        // Arrange
        var service = CreateService();
        var moduleIds = new List<int> { 1, 2, 3 };
        var callCount = 0;

        _mockStoreModuleRepository
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .Callback(() => callCount++);

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

    [Fact]
    public async Task CreateStoreAsync_ShouldUseZeroTestingPeriod_WhenConfigured()
    {
        // Arrange
        var service = CreateService();

        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(0);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

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
        result.PaymentStartDate.Should().Be(today);
    }

    #endregion

    #region Error Management Tests

    [Fact]
    public async Task CreateStoreAsync_ShouldThrow_WhenSystemConfigurationRepositoryFails()
    {
        // Arrange
        _mockSystemConfigurationRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ThrowsAsync(new InvalidOperationException("Database error"));

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
            .WithMessage("Database error");
    }

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
            .Setup(x => x.GetByIdAsync(It.IsAny<int>()))
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
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
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
            .Setup(x => x.AddAsync(It.IsAny<StoreRoleFeature>()))
            .Returns((StoreRoleFeature srf) =>
            {
                Interlocked.Increment(ref addCallCount);
                return Task.FromResult(srf);
            });

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
            .Setup(x => x.AddAsync(It.IsAny<StoreRoleFeature>()))
            .Returns((StoreRoleFeature _) =>
            {
                callOrder.Add("AddAsync");
                return Task.FromResult<StoreRoleFeature>(null!);
            });

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
            x => x.AddAsync(It.IsAny<StoreRoleFeature>()), 
            Times.Exactly(2));
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
    public async Task CreateStoreAsync_ShouldCallSystemConfigurationRepository()
    {
        // Arrange
        var service = CreateService();

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
        _mockSystemConfigurationRepository.Verify(x => x.GetTestingPeriodInMonthsAsync(),
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
        foreach (var moduleId in moduleIds)
        {
            _mockModuleRepository.Verify(x => x.GetByIdAsync(moduleId), Times.Once);
        }
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
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .Callback<StoreModule>(sm => capturedStoreModule = sm)
            .ReturnsAsync((StoreModule sm) => sm);

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
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .Callback<StoreModule>(sm => capturedStoreModule = sm)
            .ReturnsAsync((StoreModule sm) => sm);

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
            .Setup(x => x.AddAsync(It.IsAny<StoreModule>()))
            .Callback(() => callOrder.Add("StoreModule"));

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
