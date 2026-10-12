using Domain.Common.Enums;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Moved from RegisterCommandHandlerModuleTests when the artifacts-building logic moved into
/// RegisterService. Same behaviors, same assertions; only the seam changed (and the Handle_ prefix
/// became RegisterAsync_, because the service has no Handle).
/// <para>
/// REWRITTEN 2026-10-11 (store-birth-superior). These tests used to pin "the service loads the
/// default plan and hands its module ids to CreateStoreService". That is gone: the service passes
/// NO module set and injects NO <c>IPlanRepository</c> — the birth plan (Superior, 3) and its
/// catalog are <c>CreateStoreService</c>'s decision. What survives here is the negative half, which
/// is the real invariant now: registration cannot influence the module set, and the derived-store
/// role feature injection lives on the other seam (<see cref="Application.Tests.Services.Stores.CreateStoreServiceTests"/>).
/// </para>
/// </summary>
public class RegisterServiceModuleTests : RegisterServiceTestFixture
{
    [Fact]
    public async Task RegisterAsync_ShouldSucceed_WithoutResolvingAnyPlan()
    {
        var owner = await RegisterAsync();

        owner.Should().NotBeNull();
        owner.Id.Should().Be(TestOwnerId);
    }

    [Fact]
    public async Task RegisterAsync_ShouldNotAskForModules_TheBirthCatalogIsTheServicesJob()
    {
        // store-birth-superior: ICreateStoreService.CreateStoreAsync has no module parameter at all,
        // so the strongest statement available at this seam is "exactly one call, no module list
        // to smuggle". The catalog derivation itself is pinned in CreateStoreServiceTests.
        await RegisterAsync();

        MockCreateStoreService.Verify(x => x.CreateStoreAsync(
            TestOwnerId,
            TestTenantId,
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<string?>(),
            It.IsAny<bool>()), Times.Once);
    }

    [Fact]
    public async Task RegisterAsync_ShouldPointTheOwnerUserAtTheSuperiorBornStore()
    {
        // The store handed back by the service is born on Superior; registration must select THAT
        // store for the new owner user — this is the half of the flow that is still the service's.
        await RegisterAsync();

        TestStore.StorePlanId.Should().Be(BirthPlanId);
        TestOwner.User.SelectedStoreId.Should().Be(TestStoreId);
    }

    [Fact]
    public async Task RegisterAsync_ShouldPropagateTheStoreServiceFailure_Unwrapped()
    {
        // The service no longer owns a plan load of its own, so it has no PlanLoadFailed code to
        // invent: whatever CreateStoreService throws propagates untouched, and the handler maps it.
        MockCreateStoreService
            .Setup(x => x.CreateStoreAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<bool>()))
            .ThrowsAsync(new InvalidOperationException("birth plan unavailable"));

        var act = async () => await RegisterAsync();

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("birth plan unavailable");
    }

    [Fact]
    public async Task RegisterAsync_ShouldStillGuardTheOwnerUserNullCase()
    {
        // Unrelated to modules, but it is the failure the service DOES own, and removing the plan
        // load must not have disturbed the ordering that produces it.
        var ownerWithoutUser = Domain.Entities.Owners.Owner.Create(TestUserId, false, TestTenantId, "d");
        typeof(Domain.Entities.Owners.Owner).GetProperty("Id")!
            .SetValue(ownerWithoutUser, TestOwnerId);
        ownerWithoutUser.User = null!;
        MockCreateOwnerService
            .Setup(x => x.CreateOwnerAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ReturnsAsync(ownerWithoutUser);

        var act = async () => await RegisterAsync();

        (await act.Should().ThrowAsync<Application.Exceptions.ApiException>())
            .Which.AcctionCode.Should().Be("Register.OwnerUserNotCreated");
    }
}