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
/// Defect under test: a Gestor (ReSeller) actor creating an owner produced an owner with NO
/// <c>ReSellerOwner</c> link, because <c>CreateOwnerCommandHandler</c> only built the link when
/// the BODY carried a <c>reSellerId</c> — and a Gestor never sends one (the React form renders
/// the selector for SuperAdmin only).
/// <para>
/// That link is not cosmetic: <c>OwnerRepository.GetReSellerOwnersIncludingStoreModulesAsync</c>
/// filters on <c>o.ReSellerOwner.ReSeller.UserId == actorUserId</c>, so an unlinked owner is
/// INVISIBLE in the Gestor's own list. The acceptance criterion here is therefore the LIST
/// read-back (<c>GET /api/v1/Owners/all/true</c> as that same actor), not just the row.
/// </para>
/// <para>
/// Contract: the Gestor that creates the owner IS the Gestor the owner is assigned to — derived
/// from the authenticated actor, never taken from the request body. A body <c>reSellerId</c>
/// naming a different Gestor is IGNORED (not rejected) so a Gestor cannot push an owner onto
/// someone else's list. A SuperAdmin has no <c>ReSeller</c> entity, so the body selector stays
/// the only way for that role to assign one.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnersCreateGestorAutoAssignTests
{
    private readonly AppTestFactory _f;
    public OwnersCreateGestorAutoAssignTests(WebAppFixture fixture) => _f = fixture.Factory;

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

    private async Task<ReSellerOwner?> LinkForOwnerAsync(Guid ownerId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<ReSellerOwner>().IgnoreQueryFilters()
            .SingleOrDefaultAsync(x => x.OwnerId == ownerId);
    }

    /// <summary>
    /// ACCEPTANCE CRITERION 1 — a Gestor who creates an owner must find that owner in their own
    /// list. Asserts the link row AND the read-back through the API, because the row alone would
    /// still pass if the list query disagreed with it.
    /// </summary>
    [Fact]
    public async Task Create_owner_as_reseller_links_the_actor_gestor_and_the_owner_shows_in_that_gestor_list()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Actor Gestor");

            var body = Body(login);
            body.Should().NotContainKey("reSellerId");

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);

            // The Gestor link is derived from the actor, not from the body.
            var link = await LinkForOwnerAsync(ownerId);
            link.Should().NotBeNull();
            link!.ReSellerId.Should().Be(actorReSellerId);

            // ...and the owner is visible in the Gestor's own owners list.
            var listResponse = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .GetAsync("/api/v1/Owners/all/true");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var listBody = await listResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerDto>>>(ApiResponse.Json);
            listBody!.Succeeded.Should().BeTrue();
            listBody.Data.Should().NotBeNull();
            listBody.Data!.Should().Contain(o => o.Id == ownerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    /// <summary>
    /// ACCEPTANCE CRITERION 2 — a Gestor must not be able to assign the new owner to a DIFFERENT
    /// Gestor. The body value is IGNORED, not rejected: the derived actor Gestor always wins.
    /// </summary>
    [Fact]
    public async Task Create_owner_as_reseller_ignores_body_resellerId_and_links_the_actor_gestor()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var otherUser = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid actorReSellerId = Guid.Empty;
        Guid otherReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Actor Gestor");
            otherReSellerId = await SeedReSellerAsync(otherUser.UserId, "E2E Other Gestor");
            actorReSellerId.Should().NotBe(otherReSellerId);

            var body = Body(login);
            body["reSellerId"] = otherReSellerId;

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);

            var link = await LinkForOwnerAsync(ownerId);
            link.Should().NotBeNull();
            link!.ReSellerId.Should().Be(actorReSellerId);
            link.ReSellerId.Should().NotBe(otherReSellerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(otherReSellerId, Guid.Empty);
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, otherUser.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    /// <summary>
    /// ACCEPTANCE CRITERION 3 (no regression) — a SuperAdmin has no <c>ReSeller</c> entity, so the
    /// body selector stays the only way to assign a Gestor, and it must still link correctly.
    /// </summary>
    [Fact]
    public async Task Create_owner_as_superadmin_with_valid_resellerId_persists_reseller_owner_link()
    {
        var adminLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var reSellerUser = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid reSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            reSellerId = await SeedReSellerAsync(reSellerUser.UserId, "E2E Picked Gestor");

            var body = Body(login);
            body["reSellerId"] = reSellerId;

            var r = await DbTestHelpers.AuthedClient(_f, admin, adminLogin)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);

            var link = await LinkForOwnerAsync(ownerId);
            link.Should().NotBeNull();
            link!.ReSellerId.Should().Be(reSellerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(reSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, reSellerUser.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    /// <summary>
    /// ACCEPTANCE CRITERION 4 (no regression) — a SuperAdmin leaving the selector on "--" still
    /// gets 201 and no Gestor link. Auto-assignment must not invent one for a role that has no
    /// <c>ReSeller</c> entity of its own.
    /// </summary>
    [Fact]
    public async Task Create_owner_as_superadmin_without_resellerId_creates_no_reseller_owner_link()
    {
        var adminLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var login = NewLogin();
        Guid tenantId = Guid.Empty;
        try
        {
            var body = Body(login);
            body.Should().NotContainKey("reSellerId");

            var r = await DbTestHelpers.AuthedClient(_f, admin, adminLogin)
                .PostAsJsonAsync("/api/v1/Owners", body);

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = await TenantOfCreatedOwnerAsync(login);

            (await LinkForOwnerAsync(ownerId)).Should().BeNull();
        }
        finally
        {
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}
