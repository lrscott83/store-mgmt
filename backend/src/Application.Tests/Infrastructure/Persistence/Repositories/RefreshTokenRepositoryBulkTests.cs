using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Entities.Authentication;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Infrastructure.Persistence.Repositories
{
    /// <summary>
    /// Unit tests for the new <see cref="IRefreshTokenRepository.GetActiveByUserIdsAsync"/>
    /// bulk method introduced by the store-deactivation-session-revocation change.
    /// The revocation pass loads every active refresh token for the whole affected
    /// set (users with SelectedStoreId == store UNION users employed at the store)
    /// in one query, then stages Revoke()+Update() per token — the RevokeCommand
    /// per-user pattern generalized to a set.
    /// </summary>
    public class RefreshTokenRepositoryBulkTests
    {
        private static ApplicationDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            var httpContextMock = new Mock<IHttpContextService>();
            httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
            httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
            httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
            var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
            return new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);
        }

        private static RefreshToken CreateActiveToken(Guid userId, DateTime? expiresAt = null)
        {
            return new RefreshToken(
                userId,
                $"raw-{Guid.NewGuid():N}",
                expiresAt ?? DateTimeOffset.UtcNow.AddDays(35));
        }

        [Fact]
        public async Task GetActiveByUserIdsAsync_returns_active_tokens_for_all_users()
        {
            // Arrange
            using var context = CreateContext();
            var userA = Guid.NewGuid();
            var userB = Guid.NewGuid();
            var userC = Guid.NewGuid();
            var tokens = new[]
            {
                CreateActiveToken(userA),
                CreateActiveToken(userA),
                CreateActiveToken(userB),
                CreateActiveToken(userC),
            };
            context.Set<RefreshToken>().AddRange(tokens);
            await context.SaveChangesAsync();

            var revoked = CreateActiveToken(userA);
            revoked.Revoke();
            context.Set<RefreshToken>().Add(revoked);
            await context.SaveChangesAsync();

            var repository = new RefreshTokenRepository(context);

            // Act
            var result = await repository.GetActiveByUserIdsAsync(new[] { userA, userB }, CancellationToken.None);

            // Assert: active tokens of A and B only (C excluded; A's revoked excluded)
            result.Select(t => t.Id).Should().BeEquivalentTo(tokens.Take(3).Select(t => t.Id));
        }

        [Fact]
        public async Task GetActiveByUserIdsAsync_empty_set_returns_empty()
        {
            // Arrange
            using var context = CreateContext();
            var repository = new RefreshTokenRepository(context);
            // Act
            var result = await repository.GetActiveByUserIdsAsync(Array.Empty<Guid>(), CancellationToken.None);

            // Assert
            result.Should().BeEmpty();
        }

        [Fact]
        public async Task GetActiveByUserIdsAsync_cancelledToken_throws()
        {
            // Arrange
            using var context = CreateContext();
            var userA = Guid.NewGuid();
            context.Set<RefreshToken>().AddRange(CreateActiveToken(userA), CreateActiveToken(userA));
            await context.SaveChangesAsync();
            var repository = new RefreshTokenRepository(context);
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            // Act
            var act = async () => await repository.GetActiveByUserIdsAsync(new[] { userA }, cts.Token);

            // Assert
            await act.Should().ThrowAsync<OperationCanceledException>();
        }
    }
}
