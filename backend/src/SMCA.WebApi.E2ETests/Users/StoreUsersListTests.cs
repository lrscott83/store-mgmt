using System.Net;
using System.Net.Http.Headers;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

[Collection("e2e")]
public sealed class StoreUsersListTests
{
    private readonly AppTestFactory _f;
    public StoreUsersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/StoreUsers/list/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task List_without_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/StoreUsers/list/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task List_as_store_user_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/StoreUsers/list/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task List_nonbool_includeInactive_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/StoreUsers/list/not-a-bool");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task List_malformed_token_returns_401()
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "garbage");
        var r = await client.GetAsync("/api/v1/StoreUsers/list/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
