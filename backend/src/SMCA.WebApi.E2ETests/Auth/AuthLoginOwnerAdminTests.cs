using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// The register -> login round trip for a self-registered OwnerAdmin, over HTTP,
/// exactly as a real user performs it.
/// <para>
/// This round trip had no coverage, and the gap was structural rather than
/// accidental. Every other OwnerAdmin test mints its JWT directly through
/// <c>AuthTestHelpers.MintToken</c> (IJwtProvider.GenerateToken), so it never
/// reaches the login handler at all; every test that does POST /auth/login seeds
/// a SuperAdmin, which short-circuits the store check at the isGlobalAdmin branch,
/// or an inactive user, which fails before it. The one persona that must pass
/// through <c>HasActiveStore</c>'s OwnerAdmin branch was the one nobody sent
/// through the front door.
/// </para>
/// <para>
/// What that hid: an owner reaches their store through the Owner relationship.
/// RegisterCommand creates Owner + Store and sets SelectedStoreId — it never
/// creates a StoreUser row, because StoreUser is the employee table. A store
/// check that resolved the store through <c>user.StoreUser</c> therefore rejected
/// every self-registered owner with 403 Store.Inactive: registration returned 201,
/// the row existed, and the account could never authenticate.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class AuthLoginOwnerAdminTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginOwnerAdminTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Self_registered_owner_admin_can_log_in()
    {
        var login = $"owner-{Guid.NewGuid():N}@test.com";
        var storeName = $"Store-{Guid.NewGuid():N}";
        Guid tenantId = Guid.Empty;
        try
        {
            var registration = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password,
                FullName = "E2E Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = storeName,
                Code = (string?)null
            });

            registration.StatusCode.Should().Be(HttpStatusCode.Created);

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            tenantId = user!.TenantId;

            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.Login.Should().Be(login);
        }
        finally
        {
            if (tenantId == Guid.Empty)
            {
                var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
                if (created is not null) tenantId = created.TenantId;
            }
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }

    /// <summary>
    /// A login that is rejected must still be rejected for the right reason: the
    /// owner-side check reads Owner.IsActive, so deactivating the owner closes the
    /// account. Without this, a fix for the case above could degrade into "any
    /// OwnerAdmin passes", which is a weaker rule than the one being restored.
    /// </summary>
    [Fact]
    public async Task Self_registered_owner_admin_with_an_inactive_owner_is_rejected_with_403()
    {
        var login = $"owner-{Guid.NewGuid():N}@test.com";
        var storeName = $"Store-{Guid.NewGuid():N}";
        Guid tenantId = Guid.Empty;
        try
        {
            var registration = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password,
                FullName = "E2E Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = storeName,
                Code = (string?)null
            });

            registration.StatusCode.Should().Be(HttpStatusCode.Created);

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            tenantId = user!.TenantId;

            await DbTestHelpers.DeactivateOwnerByUserIdAsync(_factory, user.Id);

            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
        }
        finally
        {
            if (tenantId == Guid.Empty)
            {
                var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
                if (created is not null) tenantId = created.TenantId;
            }
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }
}
