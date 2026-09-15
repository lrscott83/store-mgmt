using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Infrastructure.Persistence.Repositories
{
    /// <summary>
    /// Unit tests for the new <see cref="IUserRepository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync"/>
    /// method introduced by the store-deactivation-session-revocation change.
    /// The method backs the store deactivation blast-radius query: it must return
    /// the ids of every user whose SelectedStoreId points at the deactivated store,
    /// WITHOUT the tenant query filter (SuperAdmin-driven deactivations cross tenants)
    /// and WITHOUT any Store.IsActive predicate (the store is already inactive when
    /// the revocation pass runs — GetAllUsersByStoreIdIncludingStoreAndRolesAsync
    /// self-filters on Store.IsActive and is unusable here).
    /// </summary>
    public class UserRepositorySelectedStoreIdTests
    {
        private static (ApplicationDbContext Context, UserRepository Repository, string TenantId) CreateContext()
        {
            var tenantId = Guid.NewGuid().ToString();
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            var httpContextMock = new Mock<IHttpContextService>();
            httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
            httpContextMock.Setup(x => x.TenantId).Returns(tenantId);
            httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

            var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
            var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);
            var repository = new UserRepository(context);
            return (context, repository, tenantId);
        }

        private static User CreateUser(Guid? selectedStoreId = null, bool isActive = true, string? login = null)
        {
            var id = Guid.NewGuid();
            var user = User.Create(
                id,
                login ?? $"user-{id:N}",
                "Password123",
                "Test User",
                null,
                $"{id:N}@test.local",
                Guid.NewGuid());
            user.SelectedStoreId = selectedStoreId ?? Guid.Empty;
            user.IsActive = isActive;
            return user;
        }

        [Fact]
        public async Task GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync_returns_matching_users()
        {
            // Arrange
            var (context, repository, _) = CreateContext();
            var storeId = Guid.NewGuid();
            var matching = new[] { CreateUser(selectedStoreId: storeId), CreateUser(selectedStoreId: storeId, isActive: false) };
            var otherStore = new[] { CreateUser(selectedStoreId: Guid.NewGuid()) };
            var noStore = new[] { CreateUser() };
            context.Set<User>().AddRange(matching);
            context.Set<User>().AddRange(otherStore);
            context.Set<User>().AddRange(noStore);
            context.SaveChanges();

            // Act
            var result = await repository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, CancellationToken.None);

            // Assert
            result.Should().BeEquivalentTo(matching.Select(u => u.Id));
            context.Dispose();
        }

        [Fact]
        public async Task GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync_empty_when_no_matches()
        {
            // Arrange
            var (context, repository, _) = CreateContext();
            var storeId = Guid.NewGuid();
            context.Set<User>().Add(CreateUser(selectedStoreId: Guid.NewGuid()));
            context.SaveChanges();

            // Act
            var result = await repository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId, CancellationToken.None);

            // Assert
            result.Should().BeEmpty();
            context.Dispose();
        }

        [Fact]
        public async Task GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync_cancelledToken_throws()
        {
            // Arrange
            var (context, repository, _) = CreateContext();
            using var cts = new CancellationTokenSource();
            cts.Cancel();

            // Act
            var act = async () => await repository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(Guid.NewGuid(), cts.Token);

            // Assert
            await act.Should().ThrowAsync<OperationCanceledException>();
            context.Dispose();
        }
    }
}
