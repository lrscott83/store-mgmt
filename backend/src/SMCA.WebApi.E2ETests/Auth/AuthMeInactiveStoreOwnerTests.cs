using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Verifies that GET /api/v1/auth/me returns 404 when the user's store or owner
/// is inactive. Previously, GetMeQueryHandler only checked user.IsActive — a
/// deactivated store or owner was invisible, leaving the session alive.
/// </summary>
[Collection("e2e")]
public sealed class AuthMeInactiveStoreOwnerTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public AuthMeInactiveStoreOwnerTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Me_with_inactive_store_returns_404_StoreInactive()
    {
        // Arrange: seed owner-admin + store (both active)
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            // Login to get a real token
            var login = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = oa.Login, Password });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            loginBody!.Succeeded.Should().BeTrue();
            var token = loginBody.Data!.AuthToken;

            // Verify /me works while store is active
            var meOk = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            meOk.StatusCode.Should().Be(HttpStatusCode.OK);

            // Act: deactivate the store (use ExecuteUpdateAsync because DbContext is NoTracking)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Store>().IgnoreQueryFilters()
                .Where(s => s.Id == oa.StoreId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));

            // Assert: /me should now return 404 with Store.Inactive
            var me = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await me.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }

    [Fact]
    public async Task Me_with_inactive_owner_returns_404_OwnerInactive()
    {
        // Arrange: seed owner-admin + store (both active)
        var oa = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            // Login to get a real token
            var login = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = oa.Login, Password });
            login.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await login.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            loginBody!.Succeeded.Should().BeTrue();
            var token = loginBody.Data!.AuthToken;

            // Verify /me works while owner is active
            var meOk = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            meOk.StatusCode.Should().Be(HttpStatusCode.OK);

            // Act: deactivate the owner (use ExecuteUpdateAsync because DbContext is NoTracking)
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Set<Owner>().IgnoreQueryFilters()
                .Where(o => o.Id == oa.OwnerId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));

            // Assert: /me should now return 404 with Owner.Inactive
            var me = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/auth/me");
            me.StatusCode.Should().Be(HttpStatusCode.NotFound);
            var body = await me.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.ActionCode.Should().Be(404);
            body.Errors.Should().ContainSingle(e => e.Code == "Owner.Inactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId);
        }
    }
}
