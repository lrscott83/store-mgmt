using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class ExportOfflineRosterTests
{
    private readonly AppTestFactory _f;
    public ExportOfflineRosterTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task SuperAdmin_export_roster_returns_full_bundle()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Seed 2 store users
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "roster-u1", "User One");
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "roster-u2", "User Two");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var roster = body.Data!;
            roster.FormatVersion.Should().Be(1);
            roster.StoreId.Should().Be(owner.StoreId);
            Guid.TryParse(roster.BundleId, out _).Should().BeTrue();

            var msPerDay = 24 * 60 * 60 * 1000L;
            (roster.ExpiresAt - roster.IssuedAt).Should().Be(35 * msPerDay);

            roster.Users.Should().HaveCount(2);
            foreach (var user in roster.Users)
            {
                user.Verifier.Should().NotBeNull();
                user.Verifier.Hash.Should().NotBeNullOrEmpty();
                user.Verifier.Salt.Should().NotBeNullOrEmpty();
                user.Verifier.Iterations.Should().Be(210_000);
            }
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_own_store_returns_200()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "oa-user1", "OA User One");

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Users.Should().HaveCount(1);
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact]
    public async Task OwnerAdmin_foreign_store_returns_400()
    {
        var ownerA = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var ownerB = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, ownerA.UserId, ownerA.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{ownerB.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerA.StoreId, ownerA.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, ownerB.StoreId, ownerB.UserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_empty_store_returns_empty_users()
    {
        var login = $"sa-empty-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // No StoreUsers seeded — store is empty
            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Users.Should().BeEmpty();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task SuperAdmin_nonexistent_store_returns_empty_users()
    {
        var login = $"sa-nx-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var nonExistentStoreId = Guid.NewGuid();

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saUserId, login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{nonExistentStoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Users.Should().BeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    [Fact]
    public async Task Plain_store_user_returns_403()
    {
        var storeUser = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, storeUser.UserId, storeUser.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{storeUser.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, storeUser.StoreId, storeUser.UserId, storeUser.OwnerUserId);
        }
    }

    private async Task SeedStoreUserAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"{prefix}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), fullName, "0000000000", login, tenantId);
        user.SelectedStoreId = storeId;
        db.Set<User>().Add(user);
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, storeId, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
    }

    private async Task CleanupStoreUsersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeUsers = await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).ToListAsync();
        var userIds = storeUsers.Select(su => su.UserId).ToList();
        db.Set<StoreUser>().RemoveRange(storeUsers);
        await db.SaveChangesAsync();

        foreach (var uid in userIds)
        {
            await RemoveWhere<UserRole>(db, r => r.UserId == uid);
            await RemoveWhere<User>(db, u => u.Id == uid);
        }
    }

    private static async Task RemoveWhere<T>(ApplicationDbContext db,
        System.Linq.Expressions.Expression<Func<T, bool>> pred) where T : class
    {
        db.Set<T>().RemoveRange(await db.Set<T>().IgnoreQueryFilters().Where(pred).ToListAsync());
        await db.SaveChangesAsync();
    }
}
