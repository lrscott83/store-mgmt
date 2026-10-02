using Application.Exceptions;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Moved from RegisterCommandHandlerModuleTests when the artifacts-building logic moved into
/// RegisterService. Same behaviors, same assertions; only the seam changed (and the Handle_ prefix
/// became RegisterAsync_, because the service has no Handle).
/// </summary>
public class RegisterServiceModuleTests : RegisterServiceTestFixture
{
    [Fact]
    public async Task RegisterAsync_WithDefaultPlanWithoutModules_ShouldSucceed()
    {
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(StorePlan.Create((int)StorePlanType.Pago, "Pago", 2, true));

        var owner = await RegisterAsync();

        owner.Should().NotBeNull();
        owner.Id.Should().Be(TestOwnerId);
    }

    [Fact]
    public async Task RegisterAsync_WithDefaultPlanWithoutModules_ShouldCreateStoreWithEmptyModuleList()
    {
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(StorePlan.Create((int)StorePlanType.Pago, "Pago", 2, true));

        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            TestOwnerId,
            TestTenantId,
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.Is<List<int>>(ids => ids.Count == 0)), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithSinglePlanModule_ShouldCreateStoreWithOneModule()
    {
        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.Is<List<int>>(ids => ids.Count == 1 && ids[0] == TestPlanModuleId)), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithMultiplePlanModules_ShouldCreateStoreWithAllPlanModules()
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 10));
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 11));
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 12));
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(plan);

        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.Is<List<int>>(ids => ids.Count == 3
                && ids.Contains(10) && ids.Contains(11) && ids.Contains(12))), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WithMultiplePlanModules_ShouldPreservePlanModuleOrder()
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 30));
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 10));
        plan.StorePlanModules.Add(StorePlanModule.Create(plan.Id, 20));
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync(plan);

        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.Is<List<int>>(ids => ids.Count == 3 && ids[0] == 30 && ids[1] == 10 && ids[2] == 20)),
            Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_WhenPlanRepositoryThrows_ShouldThrowPlanLoadFailed()
    {
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ThrowsAsync(new InvalidOperationException("Database error"));

        var act = async () => await RegisterAsync();

        // Same AcctionCode the handler used to return, so every caller can rebuild the identical
        // ResponseResult (and therefore the identical HTTP status).
        (await act.Should().ThrowAsync<ApiException>())
            .Which.AcctionCode.Should().Be("Register.PlanLoadFailed");
    }

    [Fact]
    public async Task RegisterAsync_WhenDefaultPlanIsNull_ShouldThrowPlanLoadFailed()
    {
        MockPlanRepository
            .Setup(x => x.GetActivePlanWithModulesByIdAsync(It.IsAny<int>()))
            .ReturnsAsync((StorePlan?)null);

        var act = async () => await RegisterAsync();

        (await act.Should().ThrowAsync<ApiException>())
            .Which.AcctionCode.Should().Be("Register.PlanLoadFailed");
    }

    [Fact]
    public async Task RegisterAsync_ShouldExtractModuleIdsFromDefaultPlan()
    {
        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>(),
            It.Is<List<int>>(ids => ids.Contains(TestPlanModuleId))), Times.Once);
    }
}