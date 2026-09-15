using Application.Abstractions.HttpContext;
using Application.Features.StoreManagement.Stores.Commands.DeleteStore;
using Application.UnitOfWorks;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.DeactivateStore
{
    /// <summary>
    /// Unit tests for the session-revocation hook in DeleteStoreCommandHandler
    /// (store-deactivation-session-revocation). DeactivateStore is a one-direction
    /// command (always deactivates), so the hook fires when the store WAS active —
    /// an already-inactive store (same-value semantics, A-13) must not re-run the
    /// revocation pass.
    /// </summary>
    public class DeactivateStoreCommandHandlerTests
    {
        private readonly Mock<IStoreRepository> _mockStoreRepository = new();
        private readonly Mock<IApplicationUnitOfWork> _mockUnitOfWork = new();
        private readonly Mock<IHttpContextService> _mockHttpContextService = new();
        private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer = new();
        private readonly Mock<IStoreSessionRevocationService> _mockSessionRevocationService = new();
        private readonly DeleteStoreCommandHandler _handler;

        public DeactivateStoreCommandHandlerTests()
        {
            _mockUnitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
                .ReturnsAsync(1);
            _handler = new DeleteStoreCommandHandler(
                _mockStoreRepository.Object,
                _mockUnitOfWork.Object,
                _mockHttpContextService.Object,
                _mockLocalizer.Object,
                _mockSessionRevocationService.Object);
        }

        [Fact]
        public async Task Handle_deactivating_active_store_revokes_store_sessions()
        {
            _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
            var store = CreateStore(isActive: true);
            _mockStoreRepository
                .Setup(x => x.GetStoreByIdAsync(store.Id))
                .ReturnsAsync(store);

            var result = await _handler.Handle(new DeactivateStoreCommand(store.Id), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            store.IsActive.Should().BeFalse();
            _mockSessionRevocationService.Verify(
                x => x.RevokeStoreSessionsAsync(store.Id, CancellationToken.None),
                Times.Once);
        }

        [Fact]
        public async Task Handle_already_inactive_store_does_not_re_revoke()
        {
            // Same-value semantics: the store is already inactive; a repeated
            // deactivation must not re-run the revocation pass.
            _mockHttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
            var store = CreateStore(isActive: false);
            _mockStoreRepository
                .Setup(x => x.GetStoreByIdAsync(store.Id))
                .ReturnsAsync(store);

            var result = await _handler.Handle(new DeactivateStoreCommand(store.Id), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            _mockSessionRevocationService.Verify(
                x => x.RevokeStoreSessionsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
                Times.Never);
        }

        private static Store CreateStore(bool isActive)
        {
            var store = Store.Create($"Store-{Guid.NewGuid():N}", Guid.NewGuid(), true, Guid.NewGuid());
            store.IsActive = isActive;
            return store;
        }
    }
}
