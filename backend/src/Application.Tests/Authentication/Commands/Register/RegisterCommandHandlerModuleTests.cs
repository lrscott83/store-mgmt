using Application.Features.Authentication.Commands.Register;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using FluentAssertions;
using Moq;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests for RegisterCommandHandler covering default-plan module assignment.
/// Self-registration grants exactly the modules assigned to the default (Superior)
/// plan, not every catalog module AvailableToStore.
/// </summary>
public class RegisterCommandHandlerModuleTests : RegisterCommandHandlerTestFixture
{
    #region Empty Plan Tests

    [Fact]
    public async Task Handle_WithDefaultPlanWithoutModules_ShouldSucceed()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan());

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_WithDefaultPlanWithoutModules_ShouldCreateStoreWithEmptyModuleList()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan());

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
    public async Task Handle_WithSinglePlanModule_ShouldCreateStoreWithOneModule()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan(5));

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
    public async Task Handle_WithMultiplePlanModules_ShouldCreateStoreWithAllPlanModules()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan(1, 2, 3, 4));

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
    public async Task Handle_WithMultiplePlanModules_ShouldPreservePlanModuleOrder()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan(30, 10, 20));

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
        await handler.Handle(command, CancellationToken.None);

        // Assert
        capturedModuleIds.Should().NotBeNull();
        capturedModuleIds.Should().Equal(30, 10, 20);
    }

    #endregion

    #region Plan Repository Error Tests

    [Fact]
    public async Task Handle_WhenPlanRepositoryThrows_ShouldReturnFailure()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.PlanLoadFailed");
    }

    [Fact]
    public async Task Handle_WhenDefaultPlanIsNull_ShouldReturnFailure()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync((StorePlan?)null);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.PlanLoadFailed");
    }

    #endregion

    #region Plan Module IDs Extraction Tests

    [Fact]
    public async Task Handle_ShouldExtractModuleIdsFromDefaultPlan()
    {
        // Arrange
        var handler = CreateHandler();
        var command = CreateValidCommand();

        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(CreatePlan(7, 8));

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        MockPlanRepository.Verify(
            x => x.GetActivePlanWithModulesByIdAsync((int)StorePlanType.Superior),
            Times.Once);
    }

    #endregion

    #region Helper Methods

    private static StorePlan CreatePlan(params int[] moduleIds)
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        foreach (int moduleId in moduleIds)
        {
            plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, moduleId));
        }

        return plan;
    }

    #endregion
}
