using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

public sealed class UserByIdData
{
    public Guid Id { get; set; }
    public string? OwnerName { get; set; }
    public string? StoreName { get; set; }
    public List<string> RoleNames { get; set; } = new();
}

[Collection("e2e")]
public sealed class UsersGetByIdTests
{
    private readonly AppTestFactory _f;
    public UsersGetByIdTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Get_existing_user_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync($"/api/v1/users/{id}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Get_nonexistent_id_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync($"/api/v1/users/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task Get_without_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync($"/api/v1/users/{Guid.NewGuid()}");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_as_store_user_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .GetAsync($"/api/v1/users/{Guid.NewGuid()}");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task Get_owner_admin_returns_full_body_with_owner_store_and_roles()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var actorId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var target = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actorId, login).GetAsync($"/api/v1/users/{target.UserId}");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<UserByIdData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.Id.Should().Be(target.UserId);
            body.Data.OwnerName.Should().Be("E2E OwnerAdmin");
            body.Data.StoreName.Should().NotBeNullOrEmpty();
            // Role rows are seeded with RoleType.X.GetDisplayName() as Name
            // (RoleEntityTypeConfiguration) — e.g. OwnerAdmin -> "Administrador de tienda".
            body.Data.RoleNames.Should().Contain(RoleType.OwnerAdmin.GetDisplayName());
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, target.StoreId, target.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, actorId);
        }
    }
}
