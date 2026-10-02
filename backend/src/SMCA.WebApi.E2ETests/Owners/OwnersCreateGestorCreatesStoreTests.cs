using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// The defect this file closes: a Gestor adding a customer went through
/// <c>CreateOwnerCommandHandler</c>, which created ONLY the owner. No store, so no Billing, no
/// modules, nothing to sell in — and the Gestor could not fix it by hand, because
/// /management/stores/create is gated to SuperAdmin/OwnerAdmin.
/// <para>
/// Both creation paths now run <c>RegisterService</c>, the same flow self-registration uses. These
/// tests assert the artifacts that flow is supposed to build, read back through the real database
/// rather than through the response envelope.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class OwnersCreateGestorCreatesStoreTests
{
    private const int PagoPlanId = (int)StorePlanType.Pago;

    private readonly AppTestFactory _f;
    public OwnersCreateGestorCreatesStoreTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static Dictionary<string, object?> Body(string login, string storeName) => new()
    {
        ["login"] = login,
        ["password"] = "Password123",
        ["fullName"] = "E2E Owner",
        ["cellphone"] = "0000000000",
        ["email"] = null,
        ["description"] = "e2e",
        ["storeName"] = storeName
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

    // ReSellerOwner is not in CleanupTenantCascadeAsync's table list and the FKs are Restrict, so
    // the link rows have to go before the owner/ReSeller rows.
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
    /// ACCEPTANCE CRITERION — a Gestor-created owner comes WITH a store, on the Pago birth plan,
    /// approved, with that plan's modules granted and the owner's SelectedStoreId pointing at it.
    /// </summary>
    [Fact]
    public async Task Create_owner_as_reseller_creates_the_store_too()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = $"o-{Guid.NewGuid():N}@test.com";
        const string storeName = "E2E Tienda del Gestor";
        Guid actorReSellerId = Guid.Empty;
        Guid tenantId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Actor Gestor");

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", Body(login, storeName));

            r.StatusCode.Should().Be(HttpStatusCode.Created);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
            Guid ownerId = b.Data!.Id;
            ownerId.Should().NotBeEmpty();

            // The create RESPONSE reflects the new store. OwnerProfile maps StoreModules from
            // owner.Stores and Approved from owner.Stores.Any(s => s.Approved && s.IsActive);
            // RegisterService never assigns owner.Stores directly (CreateStoreService only receives
            // ownerId and adds the Store via the repository), so this works purely because EF
            // relationship fixup populates the collection during the SaveChanges that runs BEFORE
            // the mapping in the handler. Measured, not assumed: before the shared flow this
            // endpoint returned StoreModules=[] and Approved=false because no store existed at all.
            b.Data!.StoreModules.Should().HaveCount(1);
            b.Data.Approved.Should().BeTrue();

            var createdUser = await DbTestHelpers.GetUserByLoginAsync(_f, login);
            createdUser.Should().NotBeNull();
            tenantId = createdUser!.TenantId;

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // The store itself.
            var store = await db.Set<Store>().IgnoreQueryFilters()
                .SingleOrDefaultAsync(s => s.OwnerId == ownerId);
            store.Should().NotBeNull(
                "the Gestor flow must build the same store the self-registration flow builds; " +
                "before the shared RegisterService this row simply did not exist.");
            store!.Name.Should().Be(storeName);
            store.StorePlanId.Should().Be(PagoPlanId);
            store.IsActive.Should().BeTrue();
            store.Approved.Should().BeTrue("all creation paths force approved=true");
            store.TenantId.Should().Be(tenantId);

            // The plan's modules, and only those: a Pago store must not receive Superior/VIP-only
            // modules. Same invariant self-registration already holds.
            var expectedModuleIds = await db.Set<Domain.Entities.Plans.StorePlanModule>()
                .IgnoreQueryFilters()
                .Where(spm => spm.PlanId == PagoPlanId)
                .Select(spm => spm.ModuleId)
                .ToListAsync();

            var grantedModuleIds = await db.Set<StoreModule>().IgnoreQueryFilters()
                .Where(sm => sm.StoreId == store.Id && sm.IsActive)
                .Select(sm => sm.ModuleId)
                .ToListAsync();

            grantedModuleIds.Should().BeEquivalentTo(expectedModuleIds);

            // And the owner actually points at it, so the POS opens on a usable store.
            createdUser.SelectedStoreId.Should().Be(store.Id);
        }
        finally
        {
            await DeleteReSellerRowsAsync(actorReSellerId, tenantId);
            if (tenantId != Guid.Empty) await DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }

    /// <summary>
    /// The store name is now REQUIRED on this endpoint — same rule self-registration already had,
    /// asserted with an EMPTY value so the FluentValidation rule is what rejects it (an absent key
    /// is rejected earlier by model binding, with a different error shape).
    /// </summary>
    [Fact]
    public async Task Create_owner_without_store_name_returns_400()
    {
        var actor = await DbTestHelpers.SeedUserWithRoleAsync(_f, (int)RoleType.ReSeller);
        var login = $"o-{Guid.NewGuid():N}@test.com";
        Guid actorReSellerId = Guid.Empty;
        try
        {
            actorReSellerId = await SeedReSellerAsync(actor.UserId, "E2E Actor Gestor");

            var r = await DbTestHelpers.AuthedClient(_f, actor.UserId, actor.Login)
                .PostAsJsonAsync("/api/v1/Owners", Body(login, storeName: ""));

            r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
            b!.Errors.Should().Contain(e => e.Code == "StoreName");
        }
        finally
        {
            await DeleteReSellerRowsAsync(actorReSellerId, Guid.Empty);
            await DbTestHelpers.CleanupUserAsync(_f, actor.UserId);
        }
    }
}