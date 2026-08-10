using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
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
/// The ReSeller persona round trip over HTTP, exercising the ReSeller short-circuit
/// of <c>AuthenticationService.IsValidUserAsync</c> (AuthenticationService.cs:68-77),
/// which runs BEFORE HasActiveStore: an active ReSeller may log in with no store
/// graph at all; an inactive ReSeller row fails with Auth.AccountInactive; and an
/// active user whose only trace is the ReSeller UserRole (no ReSeller row) falls
/// through to the store chain and fails with Store.Inactive.
/// </summary>
[Collection("e2e")]
public sealed class AuthLoginReSellerTests
{
    private const string Password = "Password123";

    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthLoginReSellerTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    private sealed record ReSellerFixture(Guid UserId, string Login);

    /// <summary>
    /// Seeds the minimal ReSeller graph: active user (correct Argon2 hash + pepper,
    /// same as every seed helper), UserRole ReSeller (4), and the ReSeller row.
    /// Deliberately no Store/StoreUser/Owner rows — the short-circuit must not need them.
    /// </summary>
    private async Task<ReSellerFixture> SeedReSellerAsync(bool isActive = true)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;
        var login = $"reseller-{Guid.NewGuid():N}@test.com";

        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E ReSeller", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId));
        var reSeller = ReSeller.Create(user.Id, true, 0, 25, tenantId, "E2E ReSeller");
        if (!isActive)
        {
            // D5: mutate BEFORE Add — IsActive defaults to true on the entity and the
            // DbContext is NoTracking by default, so a post-save mutation would be a
            // silent no-op. A tracked Added entity persists the mutated value.
            reSeller.IsActive = false;
        }
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        return new ReSellerFixture(user.Id, login);
    }

    /// <summary>
    /// D4 MANDATORY order: delete the ReSeller row FIRST, then the user. The ReSeller→User
    /// FK is DeleteBehavior.Restrict (ReSellerEntityTypeConfiguration.cs:28) and
    /// <c>CleanupUserAsync</c> never deletes ReSeller rows — deleting the User first throws.
    /// </summary>
    private async Task CleanupReSellerAsync(Guid userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<ReSeller>().RemoveRange(
            await db.Set<ReSeller>().IgnoreQueryFilters().Where(r => r.UserId == userId).ToListAsync());
        await db.SaveChangesAsync();
        await DbTestHelpers.CleanupUserAsync(_factory, userId);
    }

    [Fact]
    public async Task Active_re_seller_logs_in_with_no_store_graph()
    {
        var f = await SeedReSellerAsync();
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data!.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.Login.Should().Be(f.Login);
            body.Errors.Should().BeEmpty();
        }
        finally
        {
            await CleanupReSellerAsync(f.UserId);
        }
    }

    /// <summary>
    /// ReSeller.IsActive == false fires the short-circuit's own failure
    /// (AuthenticationService.cs:71-75) with Auth.AccountInactive — NOT Store.Inactive —
    /// proving the store chain is never reached.
    /// </summary>
    [Fact]
    public async Task Inactive_re_seller_row_is_rejected_with_403()
    {
        var f = await SeedReSellerAsync(isActive: false);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Auth.AccountInactive");
        }
        finally
        {
            await CleanupReSellerAsync(f.UserId);
        }
    }

    /// <summary>
    /// INTENTIONAL contract — blind-zone pin (D6, spec-mandated).
    /// An ACTIVE user whose only trace is the ReSeller UserRole (no ReSeller row) short-circuits
    /// nothing (user.ReSeller is null at AuthenticationService.cs:68) and falls into
    /// HasActiveStore, where StoreUser is null → 403 Store.Inactive. MintToken-based tests
    /// happily mint tokens for this exact shape while real login fails. This test pins that
    /// divergence BY DESIGN — a future "fix" must flag and re-decide it, not silently absorb it.
    /// </summary>
    [Fact]
    public async Task Login_RoleOnlyReSellerWithoutReSellerRow_ReturnsStoreInactive()
    {
        var f = await DbTestHelpers.SeedUserWithRoleAsync(_factory, (int)RoleType.ReSeller);
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/login",
                new { Login = f.Login, Password });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            body!.Succeeded.Should().BeFalse();
            body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_factory, f.UserId);
        }
    }
}