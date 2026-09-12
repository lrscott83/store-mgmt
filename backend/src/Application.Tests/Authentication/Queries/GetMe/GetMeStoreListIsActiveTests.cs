using Application.Abstractions.HttpContext;
using Application.Abstractions.Time;
using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Features.Authentication.Queries.GetMe;
using Application.Services.Tenants;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Authentication.Queries.GetMe;

/// <summary>
/// Tests for the /me StoreList activation flags (store-list-active-stores).
/// The OwnerAdmin fill must carry IsActive so the frontend selects can
/// filter active stores without an extra by-current-user request.
/// Uses a real StoreRepository over EF InMemory so the handler's query
/// pipeline (Where + IgnoreQueryFilters) runs against real rows, matching
/// the established GetMeQueryHandlerTests pattern.
/// </summary>
public class GetMeStoreListIsActiveTests
{
    private readonly Guid _tenantId = Guid.NewGuid();

    private (GetMeQueryHandler Handler, Guid UserId) CreateHandler(User user, List<Store> stores, bool isOwnerAdmin)
    {
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.UserExternalId).Returns(user.Id.ToString());
        httpContextMock.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(false);
        httpContextMock.Setup(x => x.IsOwnerAdmin).Returns(isOwnerAdmin);
        httpContextMock.Setup(x => x.IsReSeller).Returns(false);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new ApplicationDbContext(
            options, new TenantIdProvider(new HttpContextAccessor()), httpContextMock.Object);

        // The store-list query joins Store→Owner→User by Owner.UserId, so the
        // fixture wires each store to an Owner bound to the SAME user id the
        // http context reports — mirroring the production join.
        var owner = Domain.Entities.Owners.Owner.Create(user.Id, guest: false, _tenantId, "test owner");
        foreach (var store in stores)
        {
            store.GetType().GetProperty("OwnerId")!.SetValue(store, owner.Id);
        }

        context.Set<Domain.Entities.Owners.Owner>().Add(owner);
        context.Set<User>().Add(user);
        if (stores.Count > 0) context.Set<Store>().AddRange(stores);
        context.SaveChanges();

        var userRepository = new UserRepository(context);
        var storeRepository = new StoreRepository(context);
        var ownerRepository = new OwnerRepository(context);

        var dateTimeProvider = new Mock<IDateTimeProvider>();
        dateTimeProvider.Setup(c => c.UtcNow)
            .Returns(new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero));

        var storeModuleRepository = new Mock<IStoreModuleRepository>();
        storeModuleRepository.Setup(x => x.GetAvailableModulesByStoreIdAsync(It.IsAny<Guid>()))
            .ReturnsAsync(new List<Domain.Entities.Modules.Module>());

        var billingService = new Mock<IBillingService>();
        billingService.Setup(x => x.GetStoreBillingSummaryAsync(It.IsAny<Guid>()))
            .ReturnsAsync(new Domain.Entities.Billing.StoreBillingSummary
            {
                PlanType = "Free",
            });

        var storeRoleFeatureRepository = new Mock<IStoreRoleFeatureRepository>();
        storeRoleFeatureRepository.Setup(x =>
            x.GetStoreRoleFeaturesByUserIdAsync(It.IsAny<Guid>(), It.IsAny<List<int>>()))
            .ReturnsAsync(new List<Domain.Entities.StoreRoleFeatures.StoreRoleFeature>());

        var allowedFeaturesService = new Mock<IAllowedFeaturesService>();
        allowedFeaturesService.Setup(x =>
            x.GetAllowedFeatureIdsForCurrentUserAsync(It.IsAny<List<int>>()))
            .ReturnsAsync(new List<int>());

        var tokenBlacklistService = new Mock<ITokenBlacklistService>();

        return (new GetMeQueryHandler(
            httpContextMock.Object,
            userRepository,
            storeRoleFeatureRepository.Object,
            allowedFeaturesService.Object,
            storeModuleRepository.Object,
            billingService.Object,
            dateTimeProvider.Object,
            tokenBlacklistService.Object,
            storeRepository,
            ownerRepository), user.Id);
    }

    private User CreateOwnerUser(Guid selectedStoreId)
    {
        var login = $"owner_{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, "hash", "Owner User", "0000000000", login, _tenantId);
        user.SelectedStoreId = selectedStoreId;
        return user;
    }

    private Store CreateStore(Guid ownerId, bool isActive)
    {
        var store = Store.Create($"Store-{Guid.NewGuid():N}", ownerId, approved: true, _tenantId);
        store.IsActive = isActive;
        return store;
    }

    [Fact]
    public async Task Handle_StoreListCarriesActivationFlags_WhenOwnerHasMixedStores()
    {
        // Arrange — owner with one active and one inactive store
        var activeStore = CreateStore(Guid.NewGuid(), isActive: true);
        var inactiveStore = CreateStore(Guid.NewGuid(), isActive: false);
        var user = CreateOwnerUser(activeStore.Id);

        var (handler, _) = CreateHandler(user, new List<Store> { activeStore, inactiveStore }, isOwnerAdmin: true);

        // Act
        var result = await handler.Handle(new GetMeQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.StoreList.Should().HaveCount(2);
        result.Data.StoreList.Should().ContainSingle(s => s.Id == activeStore.Id && s.IsActive);
        result.Data.StoreList.Should().ContainSingle(s => s.Id == inactiveStore.Id && !s.IsActive);
    }

    [Fact]
    public async Task Handle_StoreListFlagsInactive_WhenOnlyOtherStoresInactive()
    {
        // Arrange — mixed actives/inactives beyond the selected store
        var selected = CreateStore(Guid.NewGuid(), isActive: true);
        var deadA = CreateStore(Guid.NewGuid(), isActive: false);
        var activeB = CreateStore(Guid.NewGuid(), isActive: true);
        var user = CreateOwnerUser(selected.Id);

        var (handler, _) = CreateHandler(user, new List<Store> { selected, deadA, activeB }, isOwnerAdmin: true);

        // Act
        var result = await handler.Handle(new GetMeQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.StoreList.Should().HaveCount(3);
        var flags = result.Data.StoreList.ToDictionary(s => s.Id, s => s.IsActive);
        flags[selected.Id].Should().BeTrue();
        flags[deadA.Id].Should().BeFalse();
        flags[activeB.Id].Should().BeTrue();
    }

    [Fact]
    public async Task Handle_StoreListSingleStoreFlagMatches()
    {
        // Arrange — single store owner, flag matches the store
        var store = CreateStore(Guid.NewGuid(), isActive: true);
        var user = CreateOwnerUser(store.Id);

        var (handler, _) = CreateHandler(user, new List<Store> { store }, isOwnerAdmin: true);

        // Act
        var result = await handler.Handle(new GetMeQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.StoreList.Should().ContainSingle();
        result.Data.StoreList[0].Id.Should().Be(store.Id);
        result.Data.StoreList[0].IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_StoreListEmptyForNonOwner()
    {
        // Arrange — a plain store user (not OwnerAdmin) gets an empty list
        var store = CreateStore(Guid.NewGuid(), isActive: true);
        var login = $"clerk_{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, "hash", "Clerk", "0000000000", login, _tenantId);
        user.SelectedStoreId = store.Id;

        var (handler, _) = CreateHandler(user, new List<Store> { store }, isOwnerAdmin: false);

        // Act
        var result = await handler.Handle(new GetMeQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.StoreList.Should().BeEmpty();
    }
}
