using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// store-deactivation-session-revocation — /me blacklist parity: the store-inactive
/// and owner-inactive verdict branches MUST blacklist the caller's access token
/// (the same per-jti mechanism the user-inactive branch already uses) before
/// returning 404. First call after the flip: 404 with the domain error; second
/// call with the same token: 401 from the blacklist middleware — the token cannot
/// keep polling /me after its verdict.
/// </summary>
[Collection("e2e")]
public sealed class AuthMeBlacklistParityTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public AuthMeBlacklistParityTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Me_store_inactive_then_second_call_401()
    {
        // Arrange: seed owner-admin + active store, login
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var login = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = oa.Login, Password });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            var token = loginBody!.Data!.AuthToken;

            // /me works while the store is active
            var meOk = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            meOk.StatusCode.Should().Be(HttpStatusCode.OK);

            // Act: deactivate the store (ExecuteUpdateAsync — the DbContext is NoTracking)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Store>().IgnoreQueryFilters()
                .Where(s => s.Id == oa.StoreId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));

            // First /me: 404 Store.Inactive (verdict + blacklist)
            var me1 = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me1.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body1 = await me1.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body1!.ActionCode.Should().Be(404);
            body1.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");

            // Second /me with the SAME token: 401 (jti blacklisted by the first verdict)
            var me2 = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me2.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    [Fact]
    public async Task Me_owner_inactive_then_second_call_401()
    {
        // Arrange: seed owner-admin + active store, login
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var login = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = oa.Login, Password });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            var token = loginBody!.Data!.AuthToken;

            // /me works while the owner is active
            var meOk = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            meOk.StatusCode.Should().Be(HttpStatusCode.OK);

            // Act: deactivate the OWNER
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Owner>().IgnoreQueryFilters()
                .Where(o => o.Id == oa.OwnerId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));

            // First /me: 404 Owner.Inactive (verdict + blacklist)
            var me1 = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me1.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body1 = await me1.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body1!.ActionCode.Should().Be(404);
            body1.Errors.Should().ContainSingle(e => e.Code == "Owner.Inactive");

            // Second /me with the SAME token: 401
            var me2 = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me2.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }
}
