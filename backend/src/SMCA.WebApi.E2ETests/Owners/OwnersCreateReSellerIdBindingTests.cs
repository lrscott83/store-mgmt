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
/// <para>
/// Every actor here is a COMPLETE Gestor: User + UserRole(ReSeller) + a ReSeller row for that same
/// user, which is the only shape production produces (CreateReSellerCommand always writes User,
/// ReSeller and UserRole together). DbTestHelpers.SeedUserWithRoleAsync(ReSeller) alone writes
/// User + UserRole and no ReSeller row — a half-Gestor the API can only be fed by a fixture, and
/// one that made CreateOwnerCommandHandler silently skip the actor-Gestor link (its
/// CreateReSellerOwnerForActor returns early when no ReSeller row exists). Binding the field is
/// orthogonal to the actor's completeness, so the actor must not be the thing under test.
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
        ["description"] = "e2e",
        // Owner-create now creates a STORE through the shared register flow, so the store name is
        // required, exactly as it is for self-registration.
        ["storeName"] = "E2E Store"
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
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Gestor Actor");

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
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
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
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Gestor Actor");

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
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
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
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Gestor Actor");

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
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    // A REAL seeded ReSeller row still produces a persisted ReSellerOwner link row, and the link
    // is the one that belongs to the creating GESTOR — never the one named in the body.
    //
    // This case used to live here as Create_owner_as_real_gestor_links_the_actor_own_reseller_and_ignores_the_body_resellerId
    // and was an exact duplicate of OwnersCreateGestorAutoAssignTests.Create_owner_as_reseller_ignores_body_resellerId_and_links_the_actor_gestor
    // (same setup, same body, same three assertions). The surviving coverage is that one; keeping
    // both meant the same contract was paid for twice on every run.
    //
    // The actor here is a complete Gestor: User + UserRole(ReSeller) + a ReSeller row for that same
    // user, which is the only shape production produces (CreateReSellerCommand always writes User,
    // ReSeller and UserRole together). A ReSeller role WITHOUT the ReSeller row is a half-Gestor
    // that cannot exist outside a fixture, so the body value must not be able to stand in for it:
    // ignoring the body is what stops a Gestor from pushing the new owner onto another Gestor's
    // list, where the owner would be invisible to the one who created it.

    // Sanity guard: an invalid, NON-EMPTY string must still be rejected as 400. If the fix
    // swallowed every non-Guid string this would go green and the endpoint would silently
    // accept garbage — the exact over-loosening this test exists to prevent.
    [Fact]
    public async Task Create_owner_with_invalid_resellerId_string_returns_400()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = NewLogin();
        Guid actorReSellerId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Gestor Actor");

            var body = Body(login);
            body["reSellerId"] = "not-a-guid";

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", body);

            // Fails at DESERIALIZATION — the body never binds, so the handler guard (and the
            // actor-Gestor link) never run. A complete Gestor actor must not change that.
            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var raw = await r.Content.ReadAsStringAsync();
            raw.Should().Contain("reSellerId");

            (await DbTestHelpers.GetUserByLoginAsync(_f, login)).Should().BeNull();
        }
        finally
        {
            await DeleteReSellerRowsAsync(actorReSellerId, Guid.Empty);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }
}
