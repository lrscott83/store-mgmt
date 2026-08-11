using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// The StoreUser persona round trip over HTTP, exactly as a real employee performs
/// it: POST /api/v1/auth/login through the store's front door. Covers the StoreUser
/// branch of <c>AuthenticationService.HasActiveStore</c> (the six-condition chain at
/// AuthenticationService.cs:125-144), which MintToken-based tests never reach.
/// <para>
/// Positive: an active StoreUser with an active store and an active store Owner gets
/// 200. Negatives pin the exact branch that fired: the store deactivated (branch 4)
/// and the store's Owner deactivated (branch 6) both return 403 Store.Inactive — not
/// Auth.AccountInactive, because the user row itself stays active.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class AuthLoginStoreUserTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginStoreUserTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task StoreUser_logs_in_to_an_active_store()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.Login.Should().Be(f.Login);
        }
        finally
        {
            // D3: pass BOTH users — OwnerUserId removes the Owner's User row, which
            // CleanupStoreGraphAsync would otherwise strand (spec cleanup scenario).
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// The store deactivated (HasActiveStore branch 4, AuthenticationService.cs:135-136):
    /// the employee's user row stays active, so the rejection code distinguishes
    /// Store.Inactive from Auth.AccountInactive.
    /// </summary>
    [Fact]
    public async Task StoreUser_with_deactivated_store_is_rejected_with_403()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            await StoreSeed.DeactivateStoreAsync(_factory, f.StoreId);

            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    /// <summary>
    /// The store's own Owner deactivated (HasActiveStore branch 6,
    /// AuthenticationService.cs:141-142): pins the !owner.IsActive branch of the chain.
    /// </summary>
    [Fact]
    public async Task StoreUser_with_deactivated_store_owner_is_rejected_with_403()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_factory, grantedFeatureId: null);
        try
        {
            await DbTestHelpers.DeactivateOwnerByUserIdAsync(_factory, f.OwnerUserId);

            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }
}