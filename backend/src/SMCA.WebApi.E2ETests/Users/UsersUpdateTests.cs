using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class UsersUpdateTests
{
    private readonly AppTestFactory _f;
    public UsersUpdateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Update_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{id}", new { FullName = "Updated Name" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Update_as_owner_admin_returns_200()
    {
        var f = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PutAsJsonAsync($"/api/v1/users/{f.UserId}", new { FullName = "Updated by OA" });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task Update_as_store_user_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PutAsJsonAsync($"/api/v1/users/{actor.UserId}", new { FullName = "Hacker" });
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task Update_without_token_returns_401()
    {
        var r = await _f.CreateClient()
            .PutAsJsonAsync($"/api/v1/users/{Guid.NewGuid()}", new { FullName = "Ghost" });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Update_empty_body_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{id}", new { });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Update_nonexistent_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PutAsJsonAsync($"/api/v1/users/{Guid.NewGuid()}", new { FullName = "Ghost" });
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }
}
