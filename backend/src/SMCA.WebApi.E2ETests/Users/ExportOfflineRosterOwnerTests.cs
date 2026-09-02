using System.Net;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class ExportOfflineRosterOwnerTests
{
    private readonly AppTestFactory _f;
    public ExportOfflineRosterOwnerTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// BUG REPRO: The store owner is NOT included in the offline roster because
    /// the roster is built from StoreUsers table, and the owner has no StoreUser record.
    /// The owner is linked to the store via the Owner entity, not StoreUser.
    /// This means the owner cannot authenticate offline.
    /// </summary>
    [Fact]
    public async Task OwnerAdmin_store_with_no_store_users_should_still_include_owner_in_roster()
    {
        // Seed an OwnerAdmin — creates User + Owner + Store, but NO StoreUser record
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // BUG: Currently this fails because the roster only queries StoreUsers,
            // and the owner has no StoreUser record. The roster returns 0 users.
            // AFTER FIX: The roster should include the owner (1 user).
            body.Data!.Users.Should().HaveCount(1);

            var rosterUser = body.Data.Users.Single();
            rosterUser.Id.Should().Be(owner.UserId);
            rosterUser.Login.Should().Be(owner.Login);
            rosterUser.IsOwnerAdmin.Should().BeTrue();
            rosterUser.Verifier.Should().NotBeNull();
            rosterUser.Verifier.Hash.Should().NotBeNullOrEmpty();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    /// <summary>
    /// When a store has both an owner AND store users, the roster should include all of them.
    /// </summary>
    [Fact]
    public async Task OwnerAdmin_store_with_store_users_includes_owner_and_users_in_roster()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Seed a store user (employee) using the helper from ExportOfflineRosterTests
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "emp1", "Employee One");

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<RosterData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            // AFTER FIX: Should have 2 users (owner + employee)
            body.Data!.Users.Should().HaveCount(2);

            // Owner should be in the roster
            body.Data.Users.Should().Contain(u => u.Id == owner.UserId && u.IsOwnerAdmin);

            // Employee should also be in the roster
            body.Data.Users.Should().Contain(u => u.Login.StartsWith("emp1"));
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    private async Task SeedStoreUserAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"{prefix}-{Guid.NewGuid():N}@test.com";
        var user = Domain.Entities.Users.User.Create(login, DbTestHelpers.HashPassword("Password123"), fullName, "0000000000", login, tenantId);
        user.SelectedStoreId = storeId;
        var preHashProtector = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<Domain.Entities.Users.User>().Add(user);
        db.Set<Domain.Entities.StoreUsers.StoreUser>().Add(Domain.Entities.StoreUsers.StoreUser.Create(user.Id, storeId, tenantId));
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
    }

    private async Task CleanupStoreUsersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var userIds = await db.Set<Domain.Entities.StoreUsers.StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).Select(su => su.UserId).ToListAsync();
        await db.Set<Domain.Entities.StoreUsers.StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).ExecuteDeleteAsync();

        foreach (var uid in userIds)
        {
            await db.Set<Domain.Entities.UserRoles.UserRole>().IgnoreQueryFilters()
                .Where(r => r.UserId == uid).ExecuteDeleteAsync();
            await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                .Where(u => u.Id == uid).ExecuteDeleteAsync();
        }
    }
}
