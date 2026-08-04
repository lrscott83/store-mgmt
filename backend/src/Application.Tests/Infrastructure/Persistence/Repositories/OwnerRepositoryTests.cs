using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Entities.Owners;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Infrastructure.Persistence.Repositories;

public class OwnerRepositoryTests
{
    private static (ApplicationDbContext Context, OwnerRepository Repository) CreateContextWithSeededOwner()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);
        context.Set<Owner>().Add(Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Test Owner"));
        context.SaveChanges();

        var repository = new OwnerRepository(context);
        return (context, repository);
    }

    [Fact]
    public async Task GetAllOwnersIncludingStoreModulesAsync_cancelledToken_throwsOperationCanceledException()
    {
        // Arrange
        var (context, repository) = CreateContextWithSeededOwner();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act
        var act = async () => await repository.GetAllOwnersIncludingStoreModulesAsync(true, cts.Token);

        // Assert
        await act.Should().ThrowAsync<OperationCanceledException>();

        context.Dispose();
    }

    [Fact]
    public async Task GetReSellerOwnersIncludingStoreModulesAsync_cancelledToken_throwsOperationCanceledException()
    {
        // Arrange
        var (context, repository) = CreateContextWithSeededOwner();
        var reSellerId = Guid.NewGuid();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        // Act
        var act = async () => await repository.GetReSellerOwnersIncludingStoreModulesAsync(reSellerId, true, cts.Token);

        // Assert
        await act.Should().ThrowAsync<OperationCanceledException>();

        context.Dispose();
    }
}
