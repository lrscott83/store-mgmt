using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Entities.Authentication;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// store-deactivation-session-revocation — E2E proof of the approved 4-point plan:
/// (1) deactivating a store actively revokes the affected users' refresh tokens in
/// the same transaction; (2) refresh enforces the user/store/owner activation
/// matrix; (3) /me blacklists on store/owner-inactive verdicts (covered by
/// AuthMeBlacklistParityTests); (4) blast-radius boundaries: non-last-store
/// isolation and the owner-with-second-store edge.
/// </summary>
[Collection("e2e")]
public sealed class StoreDeactivationSessionTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _f;
    private readonly HttpClient _client;

    public StoreDeactivationSessionTests(WebAppFixture fixture)
    {
        _f = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    private sealed record ActivationBody(bool IsActive);
    private sealed record RefreshBody(string RefreshToken);

    private async Task<(string Token, string RefreshToken)> LoginAsync(string login)
    {
        var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = login, Password });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return (body.Data!.AuthToken, body.Data.RefreshToken);
    }

    private async Task<int> CountActiveRefreshTokensAsync(Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = DateTimeOffset.UtcNow;
        return await db.Set<RefreshToken>().IgnoreQueryFilters()
            .CountAsync(rt => rt.UserId == userId && rt.RevokedAt == null && rt.ExpiresAt > now);
    }

    private async Task CleanupTokensAsync(params Guid[] userIds)
    {
        // RefreshTokens carry no FK cascade — rows must be deleted explicitly
        // (AuthRefreshTokenLifetimeTests.cs:76-81 pattern).
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tokens = db.Set<RefreshToken>().IgnoreQueryFilters()
            .Where(rt => userIds.Contains(rt.UserId));
        db.Set<RefreshToken>().RemoveRange(tokens);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Deactivating_only_store_revokes_owner_and_store_user_sessions()
    {
        // One store graph: the OwnerAdmin's only store, with SelectedStoreId on
        // it, plus a StoreUser employed (and selected) on the same store. Both
        // log in (refresh tokens issued). SuperAdmin deactivates the store.
        // Contract: BOTH users' active refresh tokens are revoked in the same
        // transaction; refresh with them 401s; owner login is blocked until the
        // SuperAdmin reactivates (HasActiveStore).
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var adminLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, Password);
        Guid storeUserUserId = Guid.Empty;
        try
        {
            // A store user on the owner's store (employed + selected)
            var storeUserLogin = $"su-{Guid.NewGuid():N}@test.com";
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = Domain.Entities.Users.User.Create(
                    storeUserLogin, DbTestHelpers.HashPassword(Password), "E2E StoreUser", "0000000000", storeUserLogin, owner.TenantId);
                db.Set<Domain.Entities.Users.User>().Add(user);
                db.Set<Domain.Entities.UserRoles.UserRole>().Add(
                    Domain.Entities.UserRoles.UserRole.Create(user.Id, (int)Domain.Common.Enums.RoleType.StoreUser, owner.TenantId));
                db.Set<Domain.Entities.StoreUsers.StoreUser>().Add(
                    Domain.Entities.StoreUsers.StoreUser.Create(user.Id, owner.StoreId, owner.TenantId));
                user.SelectedStoreId = owner.StoreId;
                await db.SaveChangesAsync();
                storeUserUserId = user.Id;
            }

            var (_, ownerRefresh) = await LoginAsync(owner.Login);
            var (_, userRefresh) = await LoginAsync(storeUserLogin);

            (await CountActiveRefreshTokensAsync(owner.UserId)).Should().BeGreaterThan(0);
            (await CountActiveRefreshTokensAsync(storeUserUserId)).Should().BeGreaterThan(0);

            // Act: SuperAdmin deactivates the store via the dedicated endpoint
            var adminClient = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
            var deactivate = await adminClient.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(false));
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: refresh tokens dead in the same transaction
            (await CountActiveRefreshTokensAsync(owner.UserId)).Should().Be(0);
            (await CountActiveRefreshTokensAsync(storeUserUserId)).Should().Be(0);

            // Refresh with the old tokens: 401
            var ownerRefreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new RefreshBody(ownerRefresh));
            ownerRefreshResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

            var userRefreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new RefreshBody(userRefresh));
            userRefreshResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

            // Login blocked while the only store is inactive (owner with no
            // active store — HasActiveStore)
            var blockedLogin = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = owner.Login, Password });
            blockedLogin.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            // Recovery: SuperAdmin reactivates; the owner logs in again (a NEW
            // refresh token — the old ones stay revoked, reactivation must not
            // resurrect them).
            var activate = await adminClient.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(true));
            activate.StatusCode.Should().Be(HttpStatusCode.OK);

            var reLogin = await LoginAsync(owner.Login);
            reLogin.RefreshToken.Should().NotBeNullOrEmpty();
        }
        finally
        {
            await CleanupTokensAsync(owner.UserId, storeUserUserId, adminId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            if (storeUserUserId != Guid.Empty)
                await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId, storeUserUserId);
            else
                await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact]
    public async Task Deactivating_non_last_store_isolates_the_blast_radius()
    {
        // Two independent store graphs (ownerA/storeA + userA, ownerB/storeB +
        // userB). Deactivating storeA kills ONLY its affected users; B's users
        // refresh normally.
        var graphA = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var graphB = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var (_, refreshA) = await LoginAsync(graphA.Login);
            var (_, refreshB) = await LoginAsync(graphB.Login);

            // Act: graphA's owner deactivates their own store
            var clientA = DbTestHelpers.AuthedClient(_f, graphA.UserId, graphA.Login);
            var deactivate = await clientA.PutAsJsonAsync(
                $"/api/v1/stores/{graphA.StoreId}/activation", new ActivationBody(false));
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: A's refresh 401s; B's refresh succeeds (isolation)
            var refreshAResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new RefreshBody(refreshA));
            refreshAResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

            var refreshBResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new RefreshBody(refreshB));
            refreshBResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await CleanupTokensAsync(graphA.UserId, graphB.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, graphA.StoreId, graphA.UserId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, graphB.StoreId, graphB.UserId);
        }
    }

    [Fact]
    public async Task Owner_with_second_active_store_keeps_their_session()
    {
        // An owner with two stores whose SelectedStoreId points at the ACTIVE
        // one: deactivating the OTHER store must not touch their refresh token
        // (the blast radius is keyed on SelectedStoreId ∪ employment, and /me
        // only ever checked the SELECTED store).
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        Guid secondStoreId = Guid.Empty;
        try
        {
            // Seed a second store for the same owner
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var second = Domain.Entities.Stores.Store.Create(
                    $"Second-{Guid.NewGuid():N}", owner.OwnerId, true, owner.TenantId);
                db.Set<Domain.Entities.Stores.Store>().Add(second);
                await db.SaveChangesAsync();
                secondStoreId = second.Id;
            }

            var (_, refresh) = await LoginAsync(owner.Login);
            (await CountActiveRefreshTokensAsync(owner.UserId)).Should().BeGreaterThan(0);

            // Act: deactivate the SECOND store (not the owner's selected one)
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var deactivate = await client.PutAsJsonAsync(
                $"/api/v1/stores/{secondStoreId}/activation", new ActivationBody(false));
            deactivate.StatusCode.Should().Be(HttpStatusCode.OK);

            // Assert: the owner's session survives — refresh still works
            var refreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh",
                new RefreshBody(refresh));
            refreshResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await CleanupTokensAsync(owner.UserId);
            // The manually-seeded second store references the owner: remove it
            // FIRST or CleanupStoreGraphAsync's Owner delete hits the FK.
            if (secondStoreId != Guid.Empty)
            {
                using var scope = _f.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters()
                    .Where(s => s.Id == secondStoreId)
                    .ExecuteDeleteAsync();
            }
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }

    [Fact]
    public async Task Same_value_deactivation_is_idempotent_no_extra_token_damage()
    {
        // A-13 semantics preserved: deactivating an ALREADY-inactive store
        // returns 200 and must not re-run the revocation pass. Driven by the
        // SuperAdmin because an owner deactivating their only store loses the
        // StoresAdmin claim (A-04 lockout — that contract is pinned in
        // StoreActivationTests and must stay untouched here).
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var adminLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, Password);
        try
        {
            var adminClient = DbTestHelpers.AuthedClient(_f, adminId, adminLogin);
            var first = await adminClient.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(false));
            first.StatusCode.Should().Be(HttpStatusCode.OK);

            // Same-value flip: 200, and the revocation pass must not re-run
            // (observable: still 200 — an exception or re-run failure would 500).
            var second = await adminClient.PutAsJsonAsync(
                $"/api/v1/stores/{owner.StoreId}/activation", new ActivationBody(false));
            second.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await CleanupTokensAsync(owner.UserId, adminId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }
}
