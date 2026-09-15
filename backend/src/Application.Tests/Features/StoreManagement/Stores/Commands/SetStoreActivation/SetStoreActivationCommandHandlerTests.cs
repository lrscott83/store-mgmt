using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.StoreManagement.Stores.Commands.SetStoreActivation;
using Application.UnitOfWorks;
using Domain.Common.Constants;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.SetStoreActivation;

public class SetStoreActivationCommandHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IGetStoreByIdService> _mockStoreByIdService;
    private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly Mock<IStoreSessionRevocationService> _mockSessionRevocationService;
    private readonly SetStoreActivationCommandHandler _handler;

    public SetStoreActivationCommandHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStoreByIdService = new Mock<IGetStoreByIdService>();
        _mockUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        _mockSessionRevocationService = new Mock<IStoreSessionRevocationService>();
        _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        _handler = new SetStoreActivationCommandHandler(
            _mockStoreRepository.Object,
            _mockStoreByIdService.Object,
            _mockUnitOfWork.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object,
            _mockSessionRevocationService.Object);
    }

    [Fact]
    public async Task Handle_not_admin_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: false);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        var act = () => _handler.Handle(new SetStoreActivationCommand(Guid.NewGuid(), true), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Handle_owner_admin_deactivates_their_store()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        var store = CreateStore(isActive: true);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.IsActive.Should().BeFalse();
        _mockStoreRepository.Verify(x => x.UpdateAsync(store), Times.Once);
    }

    [Fact]
    public async Task Handle_owner_admin_reactivates_an_inactive_store()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        var store = CreateStore(isActive: false);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, true), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_default_store_throws_Forbidden()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        var store = CreateStore(isActive: true);
        // Force the id: the DefaultStore must never be flippable through this endpoint.
        typeof(Store).GetProperty("Id")!.SetValue(store, DataUtils.DefaultStore.Id);
        ArrangeStore(store);

        var act = () => _handler.Handle(
            new SetStoreActivationCommand(DataUtils.DefaultStore.Id, false), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
        _mockStoreRepository.Verify(x => x.UpdateAsync(It.IsAny<Store>()), Times.Never);
    }

    [Fact]
    public async Task Handle_nonexistent_store_throws_NotFound()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockStoreByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(It.IsAny<Guid>()))
            .ReturnsAsync((Store?)null);

        var act = () => _handler.Handle(new SetStoreActivationCommand(Guid.NewGuid(), true), CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Handle_super_admin_flips_any_store()
    {
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        var store = CreateStore(isActive: true);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        store.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_deactivation_true_to_false_revokes_store_sessions()
    {
        // store-deactivation-session-revocation: the deactivation ACT revokes the
        // affected set's refresh tokens in the same transaction as the flag flip.
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        var store = CreateStore(isActive: true);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockSessionRevocationService.Verify(
            x => x.RevokeStoreSessionsAsync(store.Id, CancellationToken.None),
            Times.Once);
    }

    [Fact]
    public async Task Handle_reactivation_false_to_true_does_not_revoke()
    {
        // Revocation is one-way: a reactivation must not touch sessions (revoked
        // tokens stay revoked; users log in again).
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        var store = CreateStore(isActive: false);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, true), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockSessionRevocationService.Verify(
            x => x.RevokeStoreSessionsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_same_value_deactivation_does_not_revoke()
    {
        // A-13 idempotency: same-value PUT keeps 200 semantics; the revocation pass
        // must not re-run (tokens were already revoked by the first flip).
        ArrangeRoles(isSuperAdminOrOwnerAdmin: true);
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        var store = CreateStore(isActive: false);
        ArrangeStore(store);

        var result = await _handler.Handle(
            new SetStoreActivationCommand(store.Id, false), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _mockSessionRevocationService.Verify(
            x => x.RevokeStoreSessionsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private void ArrangeRoles(bool isSuperAdminOrOwnerAdmin)
    {
        _mockHttpContextService
            .Setup(x => x.IsSuperAdminOrOwnerAdmin)
            .Returns(isSuperAdminOrOwnerAdmin);
    }

    private void ArrangeStore(Store store)
    {
        _mockStoreByIdService
            .Setup(x => x.GetStoreByIdIncludingModulesAsync(store.Id))
            .ReturnsAsync(store);
    }

    private static Store CreateStore(bool isActive)
    {
        var store = Store.Create($"Store-{Guid.NewGuid():N}", Guid.NewGuid(), true, Guid.NewGuid());
        store.IsActive = isActive;
        return store;
    }
}
