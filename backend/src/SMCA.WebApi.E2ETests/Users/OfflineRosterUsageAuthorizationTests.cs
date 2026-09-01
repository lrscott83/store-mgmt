using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.StoreUsages;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Users;

/// <summary>
/// Offline roster auth contract: the roster exported from
/// GET /api/v1/StoreUsers/{storeId}/offline-roster now carries a per-user signed JWT
/// (<c>OfflineAuthToken</c>), minted at export time by ExportOfflineRosterQuery and valid
/// until the roster bundle's own <c>ExpiresAt</c>. An offline POS session uses that roster
/// JWT as the bearer for the daily store-usage telemetry POST instead of the non-JWT
/// 'offline-session' sentinel.
///
/// These tests prove:
///   1. every roster user carries a non-empty, structurally-valid OfflineAuthToken;
///   2. a roster user's OfflineAuthToken actually authorizes POST /api/v1/usages/
///      store-daily-usage (the JWT validates and the ClaimsTransformer enriches it with the
///      user's StoreId + Profile feature) → 200 OK;
///   3. a roster JWT whose expiry has passed is rejected with 401 Unauthorized.
/// </summary>
[Collection("e2e")]
public sealed class OfflineRosterUsageAuthorizationTests
{
    // FeatureType.Profile = 70 (the actual Feature row Id in the Feature table, NOT the enum
    // ordinal of StoreRoleFeatures.ProfileAdmin which is 28) — matches AuthzSeed.SeedStoreUserAsync
    // and the usage authorization tests.
    private const int ProfileFeatureId = (int)FeatureType.Profile;

    private readonly AppTestFactory _f;
    public OfflineRosterUsageAuthorizationTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// The roster export mints a non-empty OfflineAuthToken per store user (owner included).
    /// Assert each token is non-empty and structurally a JWT (three dot-separated segments).
    /// </summary>
    [Fact]
    public async Task Roster_export_includes_nonempty_OfflineAuthToken_per_user()
    {
        var saLogin = $"sa-tok-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);

        try
        {
            // Owner + 1 store user = 2 users in the roster.
            await SeedStoreUserAsync(owner.StoreId, owner.TenantId, "tok-u1", "Token User One");

            var client = DbTestHelpers.AuthedClient(_f, saUserId, saLogin);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{owner.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<OfflineRosterWithToken>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            body.Data!.Users.Should().HaveCount(2);
            foreach (var user in body.Data.Users)
            {
                user.OfflineAuthToken.Should().NotBeNullOrEmpty();
                // Structurally a JWT: exactly three dot-separated base64url segments.
                user.OfflineAuthToken.Split('.').Should().HaveCount(3);
            }
        }
        finally
        {
            await CleanupStoreUsersAsync(owner.StoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    /// <summary>
    /// A store user's roster JWT (OfflineAuthToken) is a valid bearer for the daily usage POST:
    /// token validation succeeds and the ClaimsTransformerService enriches the principal with the
    /// user's SelectedStoreId and Profile feature, so POST /api/v1/usages/store-daily-usage → 200.
    /// </summary>
    [Fact]
    public async Task Roster_OfflineAuthToken_authorizes_store_daily_usage_returns_200()
    {
        var storeUser = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: ProfileFeatureId);
        var saLogin = $"sa-usage-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saUserId, saLogin);
            var r = await client.GetAsync($"/api/v1/StoreUsers/{storeUser.StoreId}/offline-roster");
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var body = await r.Content.ReadFromJsonAsync<ApiResponse<OfflineRosterWithToken>>(ApiResponse.Json);
            var token = body!.Data!.Users.Single(u => u.Id == storeUser.UserId).OfflineAuthToken;
            token.Should().NotBeNullOrEmpty();

            var usageClient = AuthTestHelpers.BearerClient(_f, token);
            var usage = await usageClient.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            usage.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<StoreUsage>().RemoveRange(
                    await db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId == storeUser.StoreId).ToListAsync());
                await db.SaveChangesAsync();
            }
            await AuthzSeed.CleanupStoreGraphAsync(_f, storeUser.StoreId, storeUser.UserId, storeUser.OwnerUserId);
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    /// <summary>
    /// A roster JWT whose expiry has passed is rejected with 401 Unauthorized by the JWT
    /// middleware (signature validates — token minted with the real IJwtProvider and a past
    /// expiresAt — but lifetime validation fails), so an expired roster JWT can never post
    /// store-usage telemetry.
    /// </summary>
    [Fact]
    public async Task Usage_post_with_expired_roster_jwt_returns_401()
    {
        var saLogin = $"sa-exp-{Guid.NewGuid():N}@test.com";
        var saUserId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");

        try
        {
            // Mint a structurally valid JWT for a real user with a past expiry, using the
            // app's real IJwtProvider — the same provider that minted the roster token.
            string expiredToken;
            using (var scope = _f.Services.CreateScope())
            {
                var jwt = scope.ServiceProvider.GetRequiredService<Application.Abstractions.Authentication.IJwtProvider>();
                expiredToken = jwt.GenerateToken(saUserId, saLogin, DateTime.UtcNow.AddMinutes(-5));
            }
            expiredToken.Should().NotBeNullOrEmpty();

            var client = AuthTestHelpers.BearerClient(_f, expiredToken);
            var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
                new { ActiveDays = new[] { new { Day = DateTime.UtcNow.ToString("yyyy-MM-dd"), Saved = true } } });

            r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saUserId);
        }
    }

    private async Task SeedStoreUserAsync(Guid storeId, Guid tenantId, string prefix, string fullName)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var login = $"{prefix}-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), fullName, "0000000000", login, tenantId);
        user.SelectedStoreId = storeId;
        var preHashProtector = scope.ServiceProvider.GetRequiredService<Application.Abstractions.Authentication.IOfflinePreHashProtector>();
        user.OfflinePasswordPreHash = preHashProtector.Protect("Password123", user.Id);
        db.Set<User>().Add(user);
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, storeId, tenantId));
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId));
        await db.SaveChangesAsync();
    }

    private async Task CleanupStoreUsersAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var userIds = await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).Select(su => su.UserId).ToListAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(su => su.StoreId == storeId).ExecuteDeleteAsync();

        foreach (var uid in userIds)
        {
            await db.Set<UserRole>().IgnoreQueryFilters()
                .Where(r => r.UserId == uid).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters()
                .Where(u => u.Id == uid).ExecuteDeleteAsync();
        }
    }

    private sealed class OfflineRosterWithToken
    {
        public Guid StoreId { get; set; }
        public int FormatVersion { get; set; }
        public List<OfflineRosterUserWithToken> Users { get; set; } = new();
    }

    private sealed class OfflineRosterUserWithToken
    {
        public Guid Id { get; set; }
        public string Login { get; set; } = string.Empty;
        public bool IsOwnerAdmin { get; set; }
        public string OfflineAuthToken { get; set; } = string.Empty;
    }
}
