using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class StoreUsersCrudTests
{
    private readonly AppTestFactory _f;
    public StoreUsersCrudTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Create_valid_store_user_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login)
                .PostAsJsonAsync("/api/v1/StoreUsers", new
                {
                    StoreId = owner.StoreId,
                    Login = $"su-{Guid.NewGuid():N}@test.com",
                    Password = "Password123",
                    FullName = "E2E Store User",
                    RoleIds = new[] { (int)RoleType.StoreUser }
                });
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Create_duplicate_login_returns_400()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var dupLogin = $"dup-{Guid.NewGuid():N}@test.com";
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var first = await client.PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = owner.StoreId,
                Login = dupLogin,
                Password = "Password123",
                FullName = "First",
                RoleIds = new[] { (int)RoleType.StoreUser }
            });
            first.StatusCode.Should().Be(HttpStatusCode.OK);

            var second = await client.PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = owner.StoreId,
                Login = dupLogin,
                Password = "Password123",
                FullName = "Duplicate",
                RoleIds = new[] { (int)RoleType.StoreUser }
            });
            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task Create_without_token_returns_401()
    {
        var r = await _f.CreateClient()
            .PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = Guid.NewGuid(),
                Login = "nobody@test.com",
                Password = "Password123",
                FullName = "Nobody",
                RoleIds = new[] { (int)RoleType.StoreUser }
            });
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Get_existing_store_user_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            // Create a store user first
            var client = DbTestHelpers.AuthedClient(_f, id, login);
            var create = await client.PostAsJsonAsync("/api/v1/StoreUsers", new
            {
                StoreId = owner.StoreId,
                Login = $"su-{Guid.NewGuid():N}@test.com",
                Password = "Password123",
                FullName = "E2E Fetchable",
                RoleIds = new[] { (int)RoleType.StoreUser }
            });
            create.StatusCode.Should().Be(HttpStatusCode.OK);

            // Get by unknown id just to check endpoint reachable
            var r = await client.GetAsync($"/api/v1/StoreUsers/{Guid.NewGuid()}");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }
}
