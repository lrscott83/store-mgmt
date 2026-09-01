using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.StoreUsages;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// Reproduces the 401 Unauthorized that StoreUsers get when hitting
/// POST /api/v1/usages/store-daily-usage.
///
/// The UsagesController has a class-level [HasPermission(StoreRoleFeatures.ProfileAdmin)]
/// with no method-level override on store-daily-usage. The HasPermission filter
/// returns 401 only when UserExternalId is null (unauthenticated); for an
/// authenticated user without the required feature it returns 403.
///
/// This test proves which path fires for a real StoreUser:
///   1. StoreUser WITH ProfileAdmin feature → 200 OK
///   2. StoreUser WITHOUT ProfileAdmin feature → 403 Forbidden (not 401)
///   3. StoreUser authenticating through the real login endpoint → same result
/// </summary>
[Collection("e2e")]
public sealed class UsagesStoreUserAuthorizationTests
{
    private const string Password = "Password123";
    // FeatureType.Profile = 70 (the actual Feature row Id in the Feature table,
    // NOT StoreRoleFeatures.ProfileAdmin which is enum ordinal 28).
    private const int ProfileFeatureId = (int)FeatureType.Profile;

    private readonly AppTestFactory _f;
    public UsagesStoreUserAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// A StoreUser who HAS the ProfileAdmin feature can POST store-daily-usage.
    /// Uses MintToken (direct JWT minting) to isolate the permission check from
    /// the login flow.
    /// </summary>
    [Fact]
    public async Task StoreUser_with_ProfileAdmin_feature_returns_200()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: ProfileFeatureId);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);

            // AuthzSeed already sets user.SelectedStoreId = store.Id, so no
            // PUT /api/v1/stores call is needed (and StoreUser lacks StoresAdmin
            // for that endpoint anyway).
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().RemoveRange(
                    await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == f.StoreId).ToListAsync());
                await db.SaveChangesAsync();
            }
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// A StoreUser who does NOT have the ProfileAdmin feature gets 403 Forbidden,
    /// NOT 401 Unauthorized. This is the critical distinction: 401 means the filter
    /// never identified the user (UserExternalId was null); 403 means the user was
    /// identified but lacks the required feature.
    /// </summary>
    [Fact]
    public async Task StoreUser_without_ProfileAdmin_feature_returns_403_not_401()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, f.UserId, f.Login);

            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            // The filter identifies the user (UserExternalId is set) but the user
            // lacks ProfileAdmin → ForbidResult = 403. If this assertion fails with
            // 401, it means UserExternalId is null despite a valid JWT, which points
            // to a ClaimsTransformerService or token validation issue.
            r.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "a StoreUser without ProfileAdmin should get 403 Forbidden, not 401 Unauthorized");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// Full round-trip: StoreUser authenticates via the real login endpoint, then
    /// uses the returned JWT to hit store-daily-usage. This covers the ClaimsTransformer
    /// enrichment path that MintToken-based tests bypass.
    /// </summary>
    [Fact]
    public async Task StoreUser_via_real_login_with_ProfileAdmin_returns_200()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: ProfileFeatureId);
        try
        {
            var rawClient = _f.CreateClient();

            // 1. Login through the real endpoint
            var loginResp = await rawClient.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });
            loginResp.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await loginResp.Content.ReadFromJsonAsync<ApiResponse<Application.Dtos.Authentication.AuthDto>>(
                ApiResponse.Json);
            var token = loginBody!.Data!.AuthToken;

            // 2. Use the real JWT to hit the usages endpoint
            var authedClient = AuthTestHelpers.BearerClient(_f, token);

            var r = await authedClient.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            r.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().RemoveRange(
                    await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == f.StoreId).ToListAsync());
                await db.SaveChangesAsync();
            }
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// Full round-trip: StoreUser authenticates via the real login endpoint without
    /// ProfileAdmin, then hits store-daily-usage. This proves whether the real login
    /// + ClaimsTransformer flow produces 401 or 403.
    /// </summary>
    [Fact]
    public async Task StoreUser_via_real_login_without_ProfileAdmin_returns_403_not_401()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null);
        try
        {
            var rawClient = _f.CreateClient();

            var loginResp = await rawClient.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });
            loginResp.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await loginResp.Content.ReadFromJsonAsync<ApiResponse<Application.Dtos.Authentication.AuthDto>>(
                ApiResponse.Json);
            var token = loginBody!.Data!.AuthToken;

            var authedClient = AuthTestHelpers.BearerClient(_f, token);

            var r = await authedClient.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            r.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "a StoreUser without ProfileAdmin should get 403 Forbidden via real login, not 401 Unauthorized");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }
}
