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
        // Declared out here, not inside the try: the finally block needs it and a
        // try-scoped local is not visible there.
        Guid employeeId = Guid.Empty;

        try
        {
            // Seed a store user (employee) using the helper from ExportOfflineRosterTests
            employeeId = await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "emp1", "Employee One");

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
            // FK-safe order, and no leak: CleanupStoreGraphAsync deletes the StoreUser rows, the
            // Store and the Owner FIRST, and only then the UserRole/User pair for each id it was
            // given. Both ids are required — the employee's User was previously left behind, and a
            // stale User row is what later trips FK_Owner_User_UserId in an unrelated test.
            await CleanupStoreUsersAsync(owner.StoreId);
            // Empty only when the seed itself threw; then there is no employee row to clean.
            Guid[] usersToClean = employeeId == Guid.Empty
                ? new[] { owner.UserId }
                : new[] { owner.UserId, employeeId };
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, usersToClean);
        }
    }

    /// <summary>
    /// Returns the seeded employee's <c>User.Id</c>.
    ///
    /// The id MUST be handed back to <see cref="AuthzSeed.CleanupStoreGraphAsync"/>, which is the
    /// only thing that deletes the <c>UserRole</c>/<c>User</c> pair for the ids it receives. When
    /// this method returned void the employee row leaked into smca_test on every run, and the
    /// next run that deleted a User hit `FK_Owner_User_UserId` — a failure that only appeared in
    /// the full suite and never in isolation, which is what made it look like cross-test noise.
    /// </summary>
    private async Task<Guid> SeedStoreUserAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
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
        return user.Id;
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
