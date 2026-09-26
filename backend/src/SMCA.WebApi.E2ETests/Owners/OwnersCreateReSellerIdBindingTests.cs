using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// Defect under test: <c>reSellerId: ""</c> in a JSON body is not convertible to <c>Guid?</c>
/// by System.Text.Json, so the WHOLE body fails to deserialize and the endpoint answers 400
/// with "$.reSellerId" plus the collateral "command is required". The React owner-create form
/// initialises <c>reSellerId</c> to '' and only renders the &lt;select&gt; for a SuperAdmin, so a
/// Gestor (ReSeller) actor always sends the empty string.
/// <para>
/// These tests pin the accepted shapes of that single field. A property-level
/// JsonConverter on CreateOwnerCommand.ReSellerId must map "" to null while still rejecting
/// a non-empty, non-Guid string as 400 — the fix must not become a silent swallow.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnersCreateReSellerIdBindingTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateReSellerIdBindingTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static string NewLogin() => $"o-{Guid.NewGuid():N}@test.com";

    // camelCase keys on purpose: this is the exact payload shape the React client POSTs
    // (owner-create.tsx state names, serialized verbatim by owner-http-service).
    private static Dictionary<string, object?> Body(string login) => new()
    {
        ["login"] = login,
        ["password"] = "Password123",
        ["fullName"] = "E2E Owner",
        ["cellphone"] = "0000000000",
        ["email"] = null,
        ["description"] = "e2e"
    };

    private async Task<Guid> TenantOfCreatedOwnerAsync(string login)
        => (await DbTestHelpers.GetUserByLoginAsync(_f, login))?.TenantId ?? Guid.Empty;

    private async Task<Guid> SeedReSellerAsync(Guid userId, string description)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var reSeller = ReSeller.Create(userId, true, 0, 25, DataUtils.DefaultTenant.Id, description);
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        return reSeller.Id;
    }

    // ReSellerOwner is NOT in CleanupTenantCascadeAsync's table list and every FK in the model
    // is DeleteBehavior.Restrict, so the link rows have to go before the owner/ReSeller rows.
    private async Task DeleteReSellerRowsAsync(Guid reSellerId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var links = await db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .Where(r => r.ReSellerId == reSellerId || (tenantId != Guid.Empty && r.TenantId == tenantId))
            .ToListAsync();
        db.Set<ReSellerOwner>().RemoveRange(links);

        if (reSellerId != Guid.Empty)
        {
            var reSellers = await db.Set<ReSeller>().IgnoreQueryFilters()
                .Where(r => r.Id == reSellerId).ToListAsync();
            db.Set<ReSeller>().RemoveRange(reSellers);
        }

        await db.SaveChangesAsync();
    }

    // REGRESSION: a ReSeller actor posts "reSellerId": "" and must get 201 Created.
    // Before the fix this returns 400 with "$.reSellerId" (plus the collateral
    // "command is required"), because "" cannot convert to Guid? in a JSON body.
    [Fact]
    public async Task Create_owner_as_reseller_with_empty_resellerId_string_returns_201()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid tenantId = Guid.Empty;
        try
        {
            var body = Body(login);
            body["reSellerId"] = "";

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            b.Data!.Id.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);
        }
        finally
        {
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // No regression: the property simply left out of the payload still binds to null.
    [Fact]
    public async Task Create_owner_as_reseller_with_omitted_resellerId_returns_201()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid tenantId = Guid.Empty;
        try
        {
            var body = Body(login);
            body.Should().NotContainKey("reSellerId");

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            tenantId = await TenantOfCreatedOwnerAsync(login);
        }
        finally
        {
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // No regression: an explicit JSON null still binds to null.
    [Fact]
    public async Task Create_owner_as_reseller_with_null_resellerId_returns_201()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid tenantId = Guid.Empty;
        try
        {
            var body = Body(login);
            body["reSellerId"] = null;

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();

            tenantId = await TenantOfCreatedOwnerAsync(login);
        }
        finally
        {
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // The working path must survive the fix: a valid Guid of a REAL seeded ReSeller still
    // returns 201 AND still persists the ReSellerOwner link row.
    [Fact]
    public async Task Create_owner_as_reseller_with_valid_resellerId_persists_reseller_owner_link()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var reSellerUser = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid reSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            reSellerId = await SeedReSellerAsync(reSellerUser.UserId, "E2E Linked ReSeller");

            var body = Body(login);
            body["reSellerId"] = reSellerId;

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var link = await db.Set<ReSellerOwner>().IgnoreQueryFilters()
                .SingleOrDefaultAsync(x => x.OwnerId == ownerId);
            link.Should().NotBeNull();
            link!.ReSellerId.Should().Be(reSellerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(reSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, reSellerUser.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // Sanity guard: an invalid, NON-EMPTY string must still be rejected as 400. If the fix
    // swallowed every non-Guid string this would go green and the endpoint would silently
    // accept garbage — the exact over-loosening this test exists to prevent.
    [Fact]
    public async Task Create_owner_with_invalid_resellerId_string_returns_400()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        try
        {
            var body = Body(login);
            body["reSellerId"] = "not-a-guid";

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var raw = await r.Content.ReadAsStringAsync();
            raw.Should().Contain("reSellerId");

            (await DbTestHelpers.GetUserByLoginAsync(_f, login)).Should().BeNull();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, actor.UserId); }
    }
}
