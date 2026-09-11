using System.Net;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// GET /v1/auth/me — StoreList contract: OwnerAdmin receives ALL their stores
/// (active + inactive) as { Id, Name }; every other role receives an empty list.
/// </summary>
[Collection("e2e")]
public sealed class AuthMeStoreListTests
{
    private readonly AppTestFactory _f;
    public AuthMeStoreListTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    /// <summary>
    /// Seeds an OwnerAdmin with TWO stores owned by the same owner: one active
    /// (the selected store) and one inactive. Returns ids/names for assertions.
    /// </summary>
    private async Task<(Guid UserId, string Login, Guid OwnerId, Guid TenantId, Guid ActiveStoreId, string ActiveStoreName, Guid InactiveStoreId, string InactiveStoreName)>
        SeedOwnerAdminWithStoresAsync(bool includeInactiveStore)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"osl-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E StoreList Owner", "0000000000", login, tenantId);
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E StoreList owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var activeStore = Store.Create($"SL-Active-{Guid.NewGuid():N}", owner.Id, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(activeStore);

        var inactiveStoreId = Guid.Empty;
        var inactiveStoreName = string.Empty;
        if (includeInactiveStore)
        {
            var inactiveStore = Store.Create($"SL-Inactive-{Guid.NewGuid():N}", owner.Id, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
            inactiveStore.IsActive = false;
            db.Set<Store>().Add(inactiveStore);
            inactiveStoreId = inactiveStore.Id;
            inactiveStoreName = inactiveStore.Name;
        }

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = activeStore.Id;
        await db.SaveChangesAsync();
        return (user.Id, login, owner.Id, tenantId, activeStore.Id, activeStore.Name, inactiveStoreId, inactiveStoreName);
    }

    /// <summary>
    /// Cleans up a multi-store owner graph. Unlike AuthzSeed.CleanupStoreGraphAsync
    /// (which handles a single store), this deletes EVERY store of the owner before
    /// the Owner row, so a second inactive store cannot violate the FK back to it.
    /// </summary>
    private static async Task CleanupOwnerStoreGraphAsync(AppTestFactory factory, Guid ownerId, params Guid[] userIds)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeIds = await db.Set<Store>()
            .IgnoreQueryFilters()
            .Where(s => s.OwnerId == ownerId)
            .Select(s => s.Id)
            .ToListAsync();
        foreach (var storeId in storeIds)
        {
            await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreUser>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        }
        await db.Set<Store>().IgnoreQueryFilters().Where(s => s.OwnerId == ownerId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters().Where(o => o.Id == ownerId).ExecuteDeleteAsync();
        foreach (var uid in userIds)
        {
            await db.Set<UserRole>().IgnoreQueryFilters().Where(r => r.UserId == uid).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == uid).ExecuteDeleteAsync();
        }
    }

    [Fact]
    public async Task Me_owner_admin_returns_all_stores_including_inactive()
    {
        var (userId, login, ownerId, tenantId, activeId, activeName, inactiveId, inactiveName) =
            await SeedOwnerAdminWithStoresAsync(includeInactiveStore: true);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, userId, login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.StoreList.Should().ContainSingle(s => s.Id == activeId && s.Name == activeName);
            me.StoreList.Should().ContainSingle(s => s.Id == inactiveId && s.Name == inactiveName);
            me.StoreList.Should().HaveCount(2);
        }
        finally
        {
            await CleanupOwnerStoreGraphAsync(_f, ownerId, userId);
        }
    }

    [Fact]
    public async Task Me_owner_admin_with_single_store_returns_that_store()
    {
        var (userId, login, ownerId, tenantId, activeId, activeName, _, _) =
            await SeedOwnerAdminWithStoresAsync(includeInactiveStore: false);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, userId, login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.StoreList.Should().ContainSingle(s => s.Id == activeId && s.Name == activeName);
        }
        finally
        {
            await CleanupOwnerStoreGraphAsync(_f, ownerId, userId);
        }
    }

    [Fact]
    public async Task Me_store_user_returns_empty_store_list()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, f.UserId, f.Login));
            me.IsOwnerAdmin.Should().BeFalse();
            me.StoreList.Should().BeEmpty();
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId); }
    }

    [Fact]
    public async Task Me_super_admin_returns_empty_store_list()
    {
        var login = $"sa-sl-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, id, login));
            me.IsSuperAdmin.Should().BeTrue();
            me.StoreList.Should().BeEmpty();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }
}