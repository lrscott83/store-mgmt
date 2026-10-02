using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// Defect under test: the GESTOR-scoped owners list returned <c>ReSellerName = null</c>, and the
/// React card renders <c>owner.reSellerName || 'ADMIN'</c> — so every row in the Gestor's own
/// view showed the literal "ADMIN" while the SAME owner showed the correct Gestor name in the
/// SuperAdmin view.
/// <para>
/// Cause: <c>OwnerRepository.GetReSellerOwnersIncludingStoreModulesAsync</c> filtered on
/// <c>ReSellerOwner.ReSeller.UserId == actorUserId</c> — which runs in SQL, so the row WAS
/// returned — but never eagerly loaded the <c>ReSellerOwner → ReSeller → User</c> chain that
/// <c>OwnerProfile</c> maps <c>ReSellerName</c> from. The SuperAdmin query
/// (<c>GetAllOwnersIncludingStoreModulesAsync</c>) had the Include; this one did not. The
/// asymmetry was the entire defect.
/// </para>
/// <para>
/// Acceptance criterion is the LIST read-back as the Gestor, not the link row: the link already
/// existed and was already proven by <c>OwnersCreateGestorAutoAssignTests</c>. What was broken is
/// that the list did not LOAD it.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnersListReSellerNameTests
{
    private readonly AppTestFactory _f;
    public OwnersListReSellerNameTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static string NewLogin() => $"o-{Guid.NewGuid():N}@test.com";

    // camelCase keys on purpose: the exact payload shape the React client POSTs.
    private static Dictionary<string, object?> Body(string login) => new()
    {
        ["login"] = login,
        ["password"] = "Password123",
        ["fullName"] = "E2E Owner",
        ["cellphone"] = "0000000000",
        ["email"] = null,
        ["description"] = "e2e"
    };

    private async Task<Guid> SeedReSellerAsync(Guid userId, string description)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var reSeller = ReSeller.Create(userId, true, 0, 25, DataUtils.DefaultTenant.Id, description);
        db.Set<ReSeller>().Add(reSeller);
        await db.SaveChangesAsync();
        return reSeller.Id;
    }

    // ReSellerOwner is NOT in CleanupTenantCascadeAsync's table list and every FK in the model is
    // DeleteBehavior.Restrict, so the link rows have to go before the owner/ReSeller rows.
    private async Task DeleteReSellerRowsAsync(Guid reSellerId, Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var links = await db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().IgnoreQueryFilters()
            .Where(r => r.ReSellerId == reSellerId || (tenantId != Guid.Empty && r.TenantId == tenantId))
            .ToListAsync();
        db.Set<Domain.Entities.ReSellerOwners.ReSellerOwner>().RemoveRange(links);

        if (reSellerId != Guid.Empty)
        {
            var reSellers = await db.Set<ReSeller>().IgnoreQueryFilters()
                .Where(r => r.Id == reSellerId).ToListAsync();
            db.Set<ReSeller>().RemoveRange(reSellers);
        }

        await db.SaveChangesAsync();
    }

    /// <summary>
    /// A Gestor reads their own owners list: every row must carry that Gestor's NAME, not null
    /// (which the UI degrades to the literal "ADMIN").
    /// </summary>
    [Fact]
    public async Task Owners_list_as_reseller_returns_the_actor_gestor_name_instead_of_null()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Actor Gestor");

            // Read the expected name from the database rather than hardcoding it: the
            // assertion is about the NAME ROUND-TRIPPING through the Include chain, so a
            // hardcoded string would test nothing.
            var actorUser = await DbTestHelpers.GetUserByLoginAsync(_f, actor.Login);
            actorUser.Should().NotBeNull();
            string expectedName = actorUser!.FullName;
            expectedName.Should().NotBeNullOrWhiteSpace();

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", Body(login));

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            Guid ownerId = created.Data!.Id;
            ownerId.Should().NotBeEmpty();

            tenantId = (await DbTestHelpers.GetUserByLoginAsync(_f, login))?.TenantId ?? Guid.Empty;

            // The regression read: the Gestor's OWN list.
            var listResponse = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .GetAsync("/api/v1/Owners/all/true");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var listBody = await listResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerDto>>>(ApiResponse.Json);

            listBody!.Succeeded.Should().BeTrue();
            listBody.Data.Should().NotBeNull();

            var row = listBody.Data!.SingleOrDefault(o => o.Id == ownerId);
            row.Should().NotBeNull();

            // The exact symptom: null here is what made the card print "ADMIN".
            row!.ReSellerName.Should().NotBeNull();
            row.ReSellerName.Should().Be(expectedName);
            row.ReSellerId.Should().Be(actorReSellerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    /// <summary>
    /// The SuperAdmin read of the SAME owner must still resolve the Gestor name. Guards the fix
    /// against being "corrected" in only one of the two queries.
    /// </summary>
    [Fact]
    public async Task Owners_list_as_superadmin_still_returns_the_gestor_name()
    {
        var adminLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, adminLogin, "Password123");
        var gestorUser = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid reSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            reSellerId = await SeedReSellerAsync(gestorUser.UserId, "E2E Picked Gestor");

            var gestor = await DbTestHelpers.GetUserByLoginAsync(_f, gestorUser.Login);
            string expectedName = gestor!.FullName;

            var body = Body(login);
            body["reSellerId"] = reSellerId;

            var r = await DbTestHelpers.AuthedClient(_f, admin, adminLogin)
                .PostAsJsonAsync("/api/v1/Owners", body);
            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            Guid ownerId = created.Data!.Id;

            tenantId = (await DbTestHelpers.GetUserByLoginAsync(_f, login))?.TenantId ?? Guid.Empty;

            var listResponse = await DbTestHelpers.AuthedClient(_f, admin, adminLogin)
                .GetAsync("/api/v1/Owners/all/true");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var listBody = await listResponse.Content
                .ReadFromJsonAsync<ApiResponse<List<OwnerDto>>>(ApiResponse.Json);

            var row = listBody!.Data!.SingleOrDefault(o => o.Id == ownerId);
            row.Should().NotBeNull();
            row!.ReSellerName.Should().Be(expectedName);
            row.ReSellerId.Should().Be(reSellerId);
        }
        finally
        {
            await DeleteReSellerRowsAsync(reSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, gestorUser.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }
}