using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Authentication;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// A refresh token lives for 35 days. Unlike the access token, the refresh token is opaque
/// Base64 (JwtProvider.GenerateRefreshToken) — it carries no exp claim — so its lifetime is
/// observable only through the response field RefreshTokenExpiresAt and the persisted
/// RefreshTokens.ExpiresAt row. These tests pin the invariant on both surfaces.
///
/// DOCUMENTED RED: production currently inherits 7 days (AuthenticationSettings.cs:16,
/// appsettings.json:92) with no override in appsettings.Tests.json. The red is the defect,
/// not the test — when the 7→35 production change ships, these tests flip green UNTOUCHED
/// and MUST NOT be weakened to 7.
/// </summary>
[Collection("e2e")]
public sealed class AuthRefreshTokenLifetimeTests
{
    private const int ExpectedLifetimeDays = 35;

    // The clock advances between the API minting the token and this assertion running, so the
    // comparison is a window rather than an equality. It is tight enough that a lifetime of 34
    // or 36 days fails.
    private static readonly TimeSpan Tolerance = TimeSpan.FromHours(1);

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRefreshTokenLifetimeTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Login_returns_refresh_token_expiring_in_35_days()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var expected = DateTimeOffset.UtcNow.AddDays(ExpectedLifetimeDays);

            // What the API reports back to the client. RED today: the environment yields 7 days.
            body.Data!.RefreshToken.Should().NotBeNullOrEmpty();
            body.Data.RefreshTokenExpiresAt.Should().NotBeNull();
            body.Data.RefreshTokenExpiresAt!.Value.Should().BeCloseTo(expected, Tolerance);

            // What the database persists — the gate RefreshToken.IsActive reads. RED today.
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tokenHash = RefreshToken.HashToken(body.Data.RefreshToken!);
            var stored = await db.Set<RefreshToken>().IgnoreQueryFilters()
                .Where(x => x.TokenHash == tokenHash)
                .FirstOrDefaultAsync();
            stored.Should().NotBeNull();
            stored!.ExpiresAt.Should().BeCloseTo(expected, Tolerance);
        }
        finally
        {
            // RefreshTokens has no FK on UserId (migration 20260806024450) — no cascade, so the
            // rows must be deleted explicitly before the user cleanup.
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await RemoveWhereAsync<RefreshToken>(db, r => r.UserId == userId);
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }

    [Fact]
    public async Task Refresh_returns_new_refresh_token_expiring_in_35_days()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var userId = await DbTestHelpers.SeedSuperAdminAsync(_factory, login, "Password123");
        try
        {
            var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password = "Password123" });
            loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var loginBody = await loginResponse.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            loginBody!.Succeeded.Should().BeTrue();
            var oldRefreshToken = loginBody.Data!.RefreshToken;
            oldRefreshToken.Should().NotBeNullOrEmpty();

            var refreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new { RefreshToken = oldRefreshToken });
            refreshResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await refreshResponse.Content.ReadFromJsonAsync<ApiResponse<AuthData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();

            var expected = DateTimeOffset.UtcNow.AddDays(ExpectedLifetimeDays);

            // Rotation: the token is replaced, and the reported expiry carries the 35-day
            // invariant. RED today. Revocation details (RevokedAt/ReplacedByToken) are observed,
            // not asserted — design scope guard.
            body.Data!.RefreshToken.Should().NotBe(oldRefreshToken);
            body.Data.RefreshTokenExpiresAt.Should().NotBeNull();
            body.Data.RefreshTokenExpiresAt!.Value.Should().BeCloseTo(expected, Tolerance);

            // The persisted new row — the gate RefreshToken.IsActive reads. RED today.
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tokenHash = RefreshToken.HashToken(body.Data.RefreshToken!);
            var stored = await db.Set<RefreshToken>().IgnoreQueryFilters()
                .Where(x => x.TokenHash == tokenHash)
                .FirstOrDefaultAsync();
            stored.Should().NotBeNull();
            stored!.ExpiresAt.Should().BeCloseTo(expected, Tolerance);
        }
        finally
        {
            // Delete ALL rows for the user (covers the revoked old row and the new row) — no FK
            // cascade — then the user.
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await RemoveWhereAsync<RefreshToken>(db, r => r.UserId == userId);
            await DbTestHelpers.CleanupUserAsync(_factory, userId);
        }
    }

    // Local RemoveWhere<T> mirroring AuthzSeed.cs:125-129: IgnoreQueryFilters + RemoveRange.
    private static async Task RemoveWhereAsync<T>(ApplicationDbContext db,
        System.Linq.Expressions.Expression<Func<T, bool>> predicate) where T : class
    {
        db.Set<T>().RemoveRange(await db.Set<T>().IgnoreQueryFilters().Where(predicate).ToListAsync());
        await db.SaveChangesAsync();
    }
}
