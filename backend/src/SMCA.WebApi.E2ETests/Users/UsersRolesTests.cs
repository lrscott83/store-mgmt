using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Common;
using Domain.Common.Enums;
using Domain.Entities.UserRoles;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersRolesTests
{
    private readonly AppTestFactory _f;
    public UsersRolesTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Add_roles_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.ReSeller } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_role_already_active_is_idempotent()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var first = await client.PostAsJsonAsync("/api/v1/users/AddUserRoles",
                new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.StoreUser } });
            first.StatusCode.Should().Be(HttpStatusCode.OK);
            var second = await client.PostAsJsonAsync("/api/v1/users/AddUserRoles",
                new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.StoreUser } });
            second.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Delete_roles_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/DeleteUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.StoreUser } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_roles_empty_roleIds_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = Array.Empty<int>() });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_roles_with_nonexistent_user_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = Guid.NewGuid(), RoleIds = new[] { (int)RoleType.ReSeller } });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body!.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_roles_with_nonexistent_role_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { 999999 } });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body!.Errors.Should().NotBeEmpty();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_roles_with_duplicate_role_ids_returns_200_single_row()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.ReSeller, (int)RoleType.ReSeller } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var rows = await db.Set<UserRole>().IgnoreQueryFilters()
                .Where(ur => ur.UserId == target.UserId && ur.RoleId == (int)RoleType.ReSeller)
                .ToListAsync();
            rows.Should().ContainSingle();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Add_roles_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/users/AddUserRoles",
            new { UserId = Guid.NewGuid(), RoleIds = new[] { (int)RoleType.ReSeller } });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Delete_roles_without_token_returns_401()
    {
        var r = await _f.CreateClient().PostAsJsonAsync("/api/v1/users/DeleteUserRoles",
            new { UserId = Guid.NewGuid(), RoleIds = new[] { (int)RoleType.ReSeller } });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Add_roles_as_store_user_without_users_admin_returns_403()
    {
        var actor = await AuthzSeed.SeedStoreUserAsync(_f, null);
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.ReSeller } });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
        }
    }

    [Fact]
    public async Task Add_roles_response_selected_true_for_added_role()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/users/AddUserRoles",
                    new { UserId = target.UserId, RoleIds = new[] { (int)RoleType.ReSeller } });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<List<ListViewDto>>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Single(x => x.Id == ((int)RoleType.ReSeller).ToString()).Selected.Should().BeTrue();
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }
}
