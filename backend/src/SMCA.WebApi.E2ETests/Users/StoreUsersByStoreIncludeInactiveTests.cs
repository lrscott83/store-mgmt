using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// Pins the includeInactive contract of GET /api/v1/users/store/{storeId}/{includeInactive}.
///
/// UserRepository.GetAllUsersByStoreIdIncludingStoreAndRolesAsync originally contained
/// `u.StoreUser.User != null && u.StoreUser.User.IsActive` — a circular navigation
/// (StoreUser.User points back to the same User row via the StoreUser.UserId FK) that
/// demanded IsActive == true unconditionally, making includeInactive=true inoperative:
/// deactivated employees never came back in the list. The clause was removed; these
/// tests pin both directions of the repaired contract.
/// </summary>
[Collection("e2e")]
public sealed class StoreUsersByStoreIncludeInactiveTests
{
    private readonly AppTestFactory _f;
    public StoreUsersByStoreIncludeInactiveTests(WebAppFixture fixture) => _f = fixture.Factory;

    private async Task<(Guid AdminId, string AdminLogin, Guid OwnerAdminUserId, Guid StoreId, Guid InactiveEmployeeId, string InactiveEmployeeLogin)> SeedAsync()
    {
        // SuperAdmin actor: bypasses tenant query filters (IsSuperAdmin), so the list
        // is not subject to UserEntityTypeConfiguration's tenant filter.
        var adminLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");

        // OwnerAdmin (required so Store → Owner → Owner.User.IsActive holds and the
        // store graph is complete), with the Management module the users feature needs.
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        // Employee in that store — the row the predicate must (not) return.
        var employeeLogin = $"emp-{Guid.NewGuid():N}@test.com";
        var employeeId = await SeedStoreEmployeeAsync(owner.StoreId, employeeLogin);

        // Deactivate the employee directly in the DB (NoTracking-safe pattern:
        // ExecuteUpdateAsync, mirroring DbTestHelpers.DeactivateOwnerByUserIdAsync).
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters()
                .Where(u => u.Id == employeeId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false));
        }

        return (adminId, adminLogin, owner.UserId, owner.StoreId, employeeId, employeeLogin);
    }

    private async Task<Guid> SeedStoreEmployeeAsync(Guid storeId, string login)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = Domain.Common.Constants.DataUtils.DefaultTenant.Id;

        var user = Domain.Entities.Users.User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Inactive Employee", "0000000000", login, tenantId);
        db.Set<Domain.Entities.Users.User>().Add(user);
        db.Set<Domain.Entities.UserRoles.UserRole>().Add(
            Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        db.Set<Domain.Entities.StoreUsers.StoreUser>().Add(
            Domain.Entities.StoreUsers.StoreUser.Create(user.Id, storeId, tenantId));
        await db.SaveChangesAsync();
        return user.Id;
    }

    [Fact]
    public async Task List_by_store_includeInactive_true_returns_deactivated_employee()
    {
        var s = await SeedAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, s.AdminId, s.AdminLogin)
                .GetAsync($"/api/v1/users/store/{s.StoreId}/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserListDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().Contain(x => x.Id == s.InactiveEmployeeId,
                "includeInactive=true must return deactivated users of that store");
        }
        finally
        {
            await CleanupAsync(s);
        }
    }

    [Fact]
    public async Task List_by_store_includeInactive_false_excludes_deactivated_employee()
    {
        var s = await SeedAsync();
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, s.AdminId, s.AdminLogin)
                .GetAsync($"/api/v1/users/store/{s.StoreId}/false");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserListDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotContain(x => x.Id == s.InactiveEmployeeId,
                "includeInactive=false must keep excluding deactivated users");
        }
        finally
        {
            await CleanupAsync(s);
        }
    }

    private async Task CleanupAsync(
        (Guid AdminId, string AdminLogin, Guid OwnerAdminUserId, Guid StoreId, Guid InactiveEmployeeId, string InactiveEmployeeLogin) s)
    {
        // Store graph FIRST: CleanupStoreGraphAsync removes the StoreUser rows by storeId
        // (FK_StoreUser_User_UserId Restrict) before deleting the users — CleanupUserAsync
        // alone cannot delete a User that a StoreUser row still references.
        await AuthzSeed.CleanupStoreGraphAsync(_f, s.StoreId, s.OwnerAdminUserId, s.InactiveEmployeeId);
        await DbTestHelpers.CleanupUserAsync(_f, s.AdminId);
    }
}
