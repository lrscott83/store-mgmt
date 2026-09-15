using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Application.Services.Stores;
using Domain.Entities.Authentication;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using FluentAssertions;
using Moq;

namespace Application.Tests.Services.Stores
{
    /// <summary>
    /// Unit tests for <see cref="StoreSessionRevocationService"/> (store-deactivation-
    /// session-revocation change). The service computes the deactivation blast radius
    /// (users with SelectedStoreId == store UNION users employed at the store) and
    /// stages revocation of every active refresh token for that set. It only STAGES
    /// (Revoke + repository Update); the caller's UnitOfWork SaveChanges persists the
    /// flip and the token rows atomically.
    /// </summary>
    public class StoreSessionRevocationServiceTests
    {
        private readonly Mock<IUserRepository> _userRepository = new();
        private readonly Mock<IStoreUserRepository> _storeUserRepository = new();
        private readonly Mock<IRefreshTokenRepository> _refreshTokenRepository = new();

        private StoreSessionRevocationService CreateService() =>
            new(_userRepository.Object, _storeUserRepository.Object, _refreshTokenRepository.Object);

        private static RefreshToken CreateActiveToken(Guid userId) =>
            new(userId, $"raw-{Guid.NewGuid():N}", DateTimeOffset.UtcNow.AddDays(35));

        private static Domain.Entities.StoreUsers.StoreUser CreateStoreUser(Guid storeId, Guid userId) =>
            Domain.Entities.StoreUsers.StoreUser.Create(userId, storeId, Guid.NewGuid());

        [Fact]
        public async Task RevokeStoreSessionsAsync_unions_selected_and_employed_users()
        {
            // Arrange
            var storeId = Guid.NewGuid();
            var selectedOnly = Guid.NewGuid();   // session on X, employed elsewhere
            var employedOnly = Guid.NewGuid();   // works at X, session elsewhere
            var both = Guid.NewGuid();           // session on X AND employed at X
            var ownerUser = Guid.NewGuid();     // owner with SelectedStoreId == X

            _userRepository
                .Setup(r => r.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new[] { selectedOnly, both, ownerUser });

            _storeUserRepository
                .Setup(r => r.GetStoreUsersByStoreIdAsync(storeId, It.IsAny<bool>()))
                .ReturnsAsync(new[]
                {
                    CreateStoreUser(storeId, employedOnly),
                    CreateStoreUser(storeId, both),
                });

            var tokens = new[] { CreateActiveToken(selectedOnly), CreateActiveToken(employedOnly), CreateActiveToken(both), CreateActiveToken(ownerUser) };
            _refreshTokenRepository
                .Setup(r => r.GetActiveByUserIdsAsync(
                    It.Is<IReadOnlyCollection<Guid>>(ids =>
                        ids.Count == 4
                        && ids.Contains(selectedOnly) && ids.Contains(employedOnly)
                        && ids.Contains(both) && ids.Contains(ownerUser)),
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(tokens.ToList());

            var service = CreateService();

            // Act
            await service.RevokeStoreSessionsAsync(storeId, CancellationToken.None);

            // Assert: every token staged for revocation
            foreach (var token in tokens)
            {
                token.IsRevoked.Should().BeTrue();
                _refreshTokenRepository.Verify(r => r.Update(token), Times.Once);
            }
        }

        [Fact]
        public async Task RevokeStoreSessionsAsync_no_affected_users_is_noop()
        {
            // Arrange
            var storeId = Guid.NewGuid();
            _userRepository
                .Setup(r => r.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Array.Empty<Guid>());
            _storeUserRepository
                .Setup(r => r.GetStoreUsersByStoreIdAsync(storeId, It.IsAny<bool>()))
                .ReturnsAsync(Array.Empty<Domain.Entities.StoreUsers.StoreUser>());

            var service = CreateService();

            // Act
            await service.RevokeStoreSessionsAsync(storeId, CancellationToken.None);

            // Assert: bulk load never called with an empty set (guard short-circuits)
            _refreshTokenRepository.Verify(r => r.GetActiveByUserIdsAsync(It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()), Times.Never);
            _refreshTokenRepository.Verify(r => r.Update(It.IsAny<RefreshToken>()), Times.Never);
        }

        [Fact]
        public async Task RevokeStoreSessionsAsync_does_not_save()
        {
            // Arrange — staging only; SaveChanges belongs to the deactivation handler's UoW
            var storeId = Guid.NewGuid();
            _userRepository
                .Setup(r => r.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new[] { Guid.NewGuid() });
            _storeUserRepository
                .Setup(r => r.GetStoreUsersByStoreIdAsync(storeId, It.IsAny<bool>()))
                .ReturnsAsync(Array.Empty<Domain.Entities.StoreUsers.StoreUser>());
            _refreshTokenRepository
                .Setup(r => r.GetActiveByUserIdsAsync(It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(new List<RefreshToken>());

            var service = CreateService();

            // Act
            await service.RevokeStoreSessionsAsync(storeId, CancellationToken.None);

            // Assert — nothing to Save; nothing staged
            _refreshTokenRepository.Verify(r => r.Update(It.IsAny<RefreshToken>()), Times.Never);
        }

        [Fact]
        public async Task RevokeStoreSessionsAsync_employed_user_with_session_elsewhere_not_double_revoked()
        {
            // Arrange — a StoreUser at X whose SelectedStoreId is elsewhere appears in
            // the employed half only; a user selected-on-X employed elsewhere appears in
            // the selected half only. The union must be DISTINCT (no duplicate ids).
            var storeId = Guid.NewGuid();
            var a = Guid.NewGuid();
            var b = Guid.NewGuid();
            _userRepository
                .Setup(r => r.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, It.IsAny<CancellationToken>()))
                .ReturnsAsync(new[] { a });
            _storeUserRepository
                .Setup(r => r.GetStoreUsersByStoreIdAsync(storeId, It.IsAny<bool>()))
                .ReturnsAsync(new[] { CreateStoreUser(storeId, b) });

            IReadOnlyCollection<Guid>? captured = null;
            _refreshTokenRepository
                .Setup(r => r.GetActiveByUserIdsAsync(It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
                .Callback<IReadOnlyCollection<Guid>, CancellationToken>((ids, _) => captured = ids)
                .ReturnsAsync(new List<RefreshToken>());

            var service = CreateService();

            // Act
            await service.RevokeStoreSessionsAsync(storeId, CancellationToken.None);

            // Assert
            captured.Should().NotBeNull();
            captured!.Count.Should().Be(2); // a + b, distinct
        }
    }
}
