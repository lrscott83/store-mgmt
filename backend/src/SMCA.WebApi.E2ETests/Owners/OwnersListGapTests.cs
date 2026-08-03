using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Domain.Common.Constants;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SMCA.WebApi.Authentication;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

[Collection("e2e")]
public sealed class OwnersListGapTests
{
    private readonly AppTestFactory _f;
    public OwnersListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class OwnerRow { public Guid Id { get; set; } public bool IsActive { get; set; } }

    private async Task DeactivateOwnerAsync(Guid ownerId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var o = await db.Set<Domain.Entities.Owners.Owner>().IgnoreQueryFilters().AsTracking().FirstAsync(x => x.Id == ownerId);
        o.IsActive = false;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task List_owners_includeInactive_true_includes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().Contain(o => o.Id == owner.OwnerId && !o.IsActive);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_owners_includeInactive_false_excludes_inactive_owner()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        await DeactivateOwnerAsync(owner.OwnerId);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Owners/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<OwnerRow>>>(ApiResponse.Json);
            b!.Data!.Should().NotContain(o => o.Id == owner.OwnerId);
        }
        finally { await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // OQ-2 2a: a ReSeller whose UserExternalId fails Guid parse (ToGuid() -> Guid.Empty)
    // must get 400 BEFORE any repository query. The real JwtProvider always mints a valid
    // Guid NameIdentifier, so this mints a custom token with a non-Guid NameIdentifier and
    // the reseller claim baked in (the claims transformer copies it; the user lookup for an
    // invalid id returns null without throwing).
    [Fact]
    public async Task List_owners_as_reseller_with_empty_external_id_returns_400()
    {
        var token = MintTokenWithInvalidNameIdentifier(_f);
        var r = await AuthTestHelpers.BearerClient(_f, token).GetAsync("/api/v1/Owners/all/false");
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        b!.Succeeded.Should().BeFalse();
        b.Errors.Should().Contain(e => e.Description == "Invalid reseller identity");
    }

    private static string MintTokenWithInvalidNameIdentifier(AppTestFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var jwtOptions = scope.ServiceProvider.GetRequiredService<IOptions<JwtOptions>>().Value;

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, "not-a-valid-guid"),
            new Claim(ClaimTypes.Name, "e2e-invalid-external-id@test.com"),
            new Claim(StringValueUtils.ReSellerClaim, "true"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(jwtOptions.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            jwtOptions.Issuer,
            jwtOptions.Audience,
            claims,
            notBefore: null,
            expires: DateTime.UtcNow.AddDays(1),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}