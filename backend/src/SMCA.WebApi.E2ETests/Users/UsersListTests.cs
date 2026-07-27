using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Domain.Common.Enums;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

public sealed class UserListDtoShape
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

[Collection("e2e")]
public sealed class UsersListTests
{
    private readonly AppTestFactory _f;
    public UsersListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task List_as_owner_admin_with_users_admin_returns_200()
    {
        var f = await UserSeed.SeedOwnerAdminWithStoreAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login).GetAsync("/api/v1/users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally { await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId); }
    }

    [Fact]
    public async Task List_as_store_user_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.StoreUser);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task List_as_reseller_returns_403()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login).GetAsync("/api/v1/users/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }

    [Fact]
    public async Task List_without_token_returns_401()
    {
        var r = await _f.CreateClient().GetAsync("/api/v1/users/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task List_includeInactive_true_includes_inactive_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var targetLogin = $"inactive-{Guid.NewGuid():N}@test.com";
        var targetId = await DbTestHelpers.SeedInactiveUserAsync(_f, targetLogin, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/users/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserListDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().Contain(x => x.Login == targetLogin);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, targetId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task List_includeInactive_false_excludes_inactive_user()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var targetLogin = $"inactive-{Guid.NewGuid():N}@test.com";
        var targetId = await DbTestHelpers.SeedInactiveUserAsync(_f, targetLogin, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/users/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<UserListDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotContain(x => x.Login == targetLogin);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, targetId);
            await DbTestHelpers.CleanupUserAsync(_f, id);
        }
    }

    [Fact]
    public async Task List_nonbool_includeInactive_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var id = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, id, login).GetAsync("/api/v1/users/all/not-a-bool");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, id); }
    }

    [Fact]
    public async Task List_malformed_token_returns_401()
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-jwt");
        var r = await client.GetAsync("/api/v1/users/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
