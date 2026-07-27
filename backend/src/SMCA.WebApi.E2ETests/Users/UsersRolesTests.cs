using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
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
}
