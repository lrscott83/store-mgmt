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
/// store-list-active-stores — NEW coverage (sibling of the untouchable
/// AuthMeStoreListTests): /me StoreList entries carry the store's activation
/// flag, and the offline roster's OwnerAdmin rows carry the same list while
/// store-user rows carry an empty one. Additive field; the {Id, Name, Count}
/// assertions of the existing tests are unaffected.
/// </summary>
[Collection("e2e")]
public sealed class AuthMeStoreListIsActiveTests
{
    private readonly AppTestFactory _f;
    public AuthMeStoreListIsActiveTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static async Task<MeData> MeAsync(HttpClient client)
    {
        var r = await client.GetAsync("/api/v1/auth/me");
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json);
        b!.Succeeded.Should().BeTrue();
        return b.Data!;
    }

    /// <summary>
    /// Seeds an OwnerAdmin with an active selected store plus one inactive
    /// second store (same owner) and one clerk StoreUser on the active store.
    /// The owner's store carries the Management module so the roster endpoint's
    /// [HasPermission(UsersAdmin)] gate passes for the OwnerAdmin.
    /// </summary>
    private sealed record SeedFixture(
        Guid UserId, string Login, Guid OwnerId, Guid TenantId,
        Store Active, Store Inactive, Guid ClerkUserId, string ClerkLogin);

    private async Task<SeedFixture> SeedOwnerWithActiveAndInactiveAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"slia-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E IsActive Owner", "0000000000", login, tenantId);
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E IsActive owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var active = Store.Create($"SLIA-Active-{Guid.NewGuid():N}", owner.Id, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        db.Set<Store>().Add(active);
        var inactive = Store.Create($"SLIA-Dead-{Guid.NewGuid():N}", owner.Id, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow));
        inactive.IsActive = false;
        db.Set<Store>().Add(inactive);
        await db.SaveChangesAsync();

        // The roster endpoint is gated by [HasPermission(UsersAdmin)] — OwnerAdmin
        // permission flows from the store's modules, so mirror SeedOwnerAdminAsync's
        // withManagementModule: ManagementModuleId (7) carries the UsersAdmin feature.
        db.Set<StoreModule>().Add(StoreModule.Create(active.Id, AuthzSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        user.SelectedStoreId = active.Id;

        // One clerk on the active store: the roster's non-owner row.
        var clerkLogin = $"slia-clerk-{Guid.NewGuid():N}@test.com";
        var clerk = User.Create(clerkLogin, DbTestHelpers.HashPassword("Password123"), "E2E IsActive Clerk", "0000000000", clerkLogin, tenantId);
        clerk.OfflinePasswordPreHash = preHashProtector.Protect("Password123", clerk.Id);
        db.Set<User>().Add(clerk);
        db.Set<UserRole>().Add(UserRole.Create(clerk.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(clerk.Id, active.Id, tenantId));
        clerk.SelectedStoreId = active.Id;

        await db.SaveChangesAsync();
        return new SeedFixture(user.Id, login, owner.Id, tenantId, active, inactive, clerk.Id, clerkLogin);
    }

    /// <summary>Same multi-store cleanup shape as AuthMeStoreListTests.</summary>
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
    public async Task Me_owner_store_list_carries_is_active_flags()
    {
        var seed = await SeedOwnerWithActiveAndInactiveAsync();
        try
        {
            var me = await MeAsync(DbTestHelpers.AuthedClient(_f, seed.UserId, seed.Login));
            me.IsOwnerAdmin.Should().BeTrue();
            me.StoreList.Should().HaveCount(2);
            me.StoreList.Should().ContainSingle(s => s.Id == seed.Active.Id && s.Name == seed.Active.Name && s.IsActive);
            me.StoreList.Should().ContainSingle(s => s.Id == seed.Inactive.Id && s.Name == seed.Inactive.Name && !s.IsActive);
        }
        finally
        {
            await CleanupOwnerStoreGraphAsync(_f, seed.OwnerId, seed.UserId, seed.ClerkUserId);
        }
    }

    [Fact]
    public async Task Roster_owner_row_carries_store_list_with_flags()
    {
        var seed = await SeedOwnerWithActiveAndInactiveAsync();
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, seed.UserId, seed.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seed.Active.Id}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            // The synthetic owner row + the clerk row are both in the bundle.
            var ownerRow = b.Data!.Users.SingleOrDefault(u => u.Id == seed.UserId);
            ownerRow.Should().NotBeNull();
            ownerRow!.IsOwnerAdmin.Should().BeTrue();
            ownerRow.StoreList.Should().HaveCount(2);
            var flags = ownerRow.StoreList.ToDictionary(s => s.Id, s => s.IsActive);
            flags[seed.Active.Id].Should().BeTrue();
            flags[seed.Inactive.Id].Should().BeFalse();
        }
        finally
        {
            await CleanupOwnerStoreGraphAsync(_f, seed.OwnerId, seed.UserId, seed.ClerkUserId);
        }
    }

    [Fact]
    public async Task Roster_store_user_row_carries_empty_store_list()
    {
        var seed = await SeedOwnerWithActiveAndInactiveAsync();
        try
        {
            // The roster endpoint is OwnerAdmin/SuperAdmin-gated: export as the
            // OWNER, then assert the clerk's row inside the bundle.
            var client = DbTestHelpers.AuthedClient(_f, seed.UserId, seed.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{seed.Active.Id}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            // The store-user row (not the owner) must carry an empty list.
            var clerkRow = b.Data!.Users.SingleOrDefault(u => u.Id == seed.ClerkUserId);
            clerkRow.Should().NotBeNull();
            clerkRow!.IsOwnerAdmin.Should().BeFalse();
            clerkRow.StoreList.Should().BeEmpty();
        }
        finally
        {
            await CleanupOwnerStoreGraphAsync(_f, seed.OwnerId, seed.UserId, seed.ClerkUserId);
        }
    }
}
