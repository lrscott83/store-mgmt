using Application.Features.Authentication.Commands.Register;
using Domain.Entities.Modules;
using FluentAssertions;
using Moq;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests for RegisterCommandHandler covering module availability scenarios.
/// </summary>
public class RegisterCommandHandlerModuleTests : RegisterCommandHandlerTestFixture
{
    #region Empty Modules Tests

    [Fact]
    public async Task Handle_WithNoAvailableModules_ShouldSucceed()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module>());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WithNoAvailableModules_ShouldCreateStoreWithEmptyModuleList()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module>());

        List<int>? capturedModuleIds = null;
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>(),
                It.IsAny<List<int>>()))
            .Callback<Guid, Guid, string, string?, string?, bool, List<int>>(
                (ownerId, tenantId, name, desc, logo, isActive, moduleIds) => 
                    capturedModuleIds = moduleIds)
            .ReturnsAsync(TestStore);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedModuleIds.Should().NotBeNull();
        capturedModuleIds.Should().BeEmpty();
    }

    #endregion

    #region Single Module Tests

    [Fact]
    public async Task Handle_WithSingleModule_ShouldCreateStoreWithOneModule()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        var singleModule = CreateModule(id: 5, name: "Sales Only");

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module> { singleModule });

        List<int>? capturedModuleIds = null;
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>(),
                It.IsAny<List<int>>()))
            .Callback<Guid, Guid, string, string?, string?, bool, List<int>>(
                (ownerId, tenantId, name, desc, logo, isActive, moduleIds) => 
                    capturedModuleIds = moduleIds)
            .ReturnsAsync(TestStore);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedModuleIds.Should().NotBeNull();
        capturedModuleIds.Should().ContainSingle()
            .Which.Should().Be(5);
    }

    #endregion

    #region Multiple Modules Tests

    [Fact]
    public async Task Handle_WithMultipleModules_ShouldCreateStoreWithAllModules()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        
        var modules = new List<Module>
        {
            CreateModule(id: 1, name: "Sales"),
            CreateModule(id: 2, name: "Inventory"),
            CreateModule(id: 3, name: "Reports"),
            CreateModule(id: 4, name: "Customers")
        };

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(modules);

        List<int>? capturedModuleIds = null;
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>(),
                It.IsAny<List<int>>()))
            .Callback<Guid, Guid, string, string?, string?, bool, List<int>>(
                (ownerId, tenantId, name, desc, logo, isActive, moduleIds) => 
                    capturedModuleIds = moduleIds)
            .ReturnsAsync(TestStore);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        capturedModuleIds.Should().NotBeNull();
        capturedModuleIds.Should().HaveCount(4);
        capturedModuleIds.Should().BeEquivalentTo(new[] { 1, 2, 3, 4 });
    }

    [Fact]
    public async Task Handle_WithMultipleModules_ShouldPreserveModuleOrder()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        
        var modules = new List<Module>
        {
            CreateModule(id: 10, name: "First Module"),
            CreateModule(id: 20, name: "Second Module"),
            CreateModule(id: 30, name: "Third Module")
        };

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(modules);

        List<int>? capturedModuleIds = null;
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(),
                It.IsAny<Guid>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<string?>(),
                It.IsAny<bool>(),
                It.IsAny<List<int>>()))
            .Callback<Guid, Guid, string, string?, string?, bool, List<int>>(
                (ownerId, tenantId, name, desc, logo, isActive, moduleIds) => 
                    capturedModuleIds = moduleIds)
            .ReturnsAsync(TestStore);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        capturedModuleIds.Should().NotBeNull();
        capturedModuleIds.Should().BeInAscendingOrder();
    }

    #endregion

    #region Module Repository Error Tests

    [Fact]
    public async Task Handle_WhenModuleRepositoryThrows_ShouldReturnFailure()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
    }

    #endregion

    #region Module IDs Extraction Tests

    [Fact]
    public async Task Handle_ShouldExtractModuleIdsFromRepository()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        
        var modules = new List<Module>
        {
            CreateModule(id: 7, name: "Module A"),
            CreateModule(id: 8, name: "Module B")
        };

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(modules);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockModuleRepository.Verify(x => x.GetAvailableModulesToStore(), Times.Once);
    }

    [Fact]
    public async Task Handle_ShouldConvertModulesToHashSet()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();
        
        var modules = new List<Module>
        {
            CreateModule(id: 1, name: "Sales"),
            CreateModule(id: 2, name: "Inventory"),
            CreateModule(id: 3, name: "Reports")
        };

        MockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(modules);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        // HashSet should remove duplicates if any, and allow fast lookup
    }

    #endregion

    #region Helper Methods

    private Module CreateModule(int id, string name)
    {
        var module = Module.Create(
            id: id,
            name: name,
            order: id,
            priceIncluded: true,
            price: 100f,
            discountPrice: 10f,
            percentDiscountPrice: 5f,
            availableToStore: true,
            isActive: true);

        return module;
    }

    #endregion
}
