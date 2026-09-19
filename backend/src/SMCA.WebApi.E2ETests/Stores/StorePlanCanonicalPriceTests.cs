using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for the CANONICAL PLAN PRICE on the store cards
/// (docs/plans/2026-09-15-store-plan-canonical-price-plan.md): the Owner's
/// my-stores (GET /v1/stores/my-stores → OwnerStoreDto.PlanPrice/PlanCurrentPrice)
/// and the SuperAdmin listing (GET /v1/stores/by-current-user → StoreDto.PlanPrice/
/// PlanCurrentPrice) must expose the plan's catalog price — Σ over the plan's
/// member MODULES with the same formula GET /v1/plans (PlanProfile) uses — and
/// never the store's frozen StoreModule snapshot. With the same database, both
/// prices (and the plan view's) are equal by construction.
/// </summary>
[Collection("e2e")]
public sealed class StorePlanCanonicalPriceTests
{
    private readonly AppTestFactory _f;
    public StorePlanCanonicalPriceTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record PlanDtoShape(int Id, string PlanType, float Price);

    private sealed record OwnerStoreShape(
        Guid Id, string Name, bool Approved, string PlanType,
        float? PlanPrice, float? PlanCurrentPrice);

    private sealed record SuperStoreShape(
        Guid Id, string Name, bool Approved, string PlanType,
        float? PlanPrice, float? PlanCurrentPrice);

    // Independent summations may add the same floats in different orders —
    // compare with a 0.01 tolerance instead of bit equality.
    private const float PriceTolerance = 0.01f;

    // ═══ P1 — card price == plan-catalog price, on both views, per plan ═══════

    [Fact]
    public async Task P1_card_price_equals_plan_catalog_price_on_both_views()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");
        try
        {
            Guid freeId, pagoId, superiorId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var tenantId = owner.TenantId;
                var free = Store.Create($"Free-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Gratis);
                var pago = Store.Create($"Pago-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                var superior = Store.Create($"Superior-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Superior);
                db.Set<Store>().AddRange(free, pago, superior);
                await db.SaveChangesAsync();
                freeId = free.Id;
                pagoId = pago.Id;
                superiorId = superior.Id;
            }

            // The plan catalog from GET /v1/plans is the expected-price source.
            var superClient = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);
            var plansRes = await superClient.GetAsync("/api/v1/plans");
            plansRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var plans = (await plansRes.Content.ReadFromJsonAsync<ApiResponse<List<PlanDtoShape>>>(ApiResponse.Json))!
                .Data.ToDictionary(p => p.PlanType);
            plans.Should().ContainKeys("Gratis", "Pago", "Superior");

            var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login), "the seeded owner-admin must pass the StoresAdmin gate");
            var list = await ListSuperStoresAsync(superClient);

            // Pago/Superior: the card shows exactly the plan-catalog price — on BOTH views.
            var minePago = mine.Single(s => s.Id == pagoId);
            minePago.PlanType.Should().Be("Pago");
            minePago.PlanPrice.Should().NotBeNull();
            minePago.PlanCurrentPrice.Should().NotBeNull();
            minePago.PlanCurrentPrice!.Value.Should().BeApproximately(plans["Pago"].Price, PriceTolerance,
                "the Pago card must show the plan-catalog price");

            var listSuperior = list.Single(s => s.Id == superiorId);
            listSuperior.PlanType.Should().Be("Superior");
            listSuperior.PlanPrice.Should().NotBeNull();
            listSuperior.PlanCurrentPrice.Should().NotBeNull();
            listSuperior.PlanCurrentPrice!.Value.Should().BeApproximately(plans["Superior"].Price, PriceTolerance,
                "the SuperAdmin listing must show the Superior plan-catalog price");

            // Gratis: zero-price members — both canonical fields are 0, not null.
            var mineFree = mine.Single(s => s.Id == freeId);
            mineFree.PlanType.Should().Be("Gratis");
            mineFree.PlanCurrentPrice.Should().Be(0f);
            mineFree.PlanPrice.Should().Be(0f);
            var listFree = list.Single(s => s.Id == freeId);
            listFree.PlanCurrentPrice.Should().Be(0f);
            listFree.PlanPrice.Should().Be(0f);
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    // ═══ P2 — toggle Free→Paid: card shows the Pago plan price, not the sum ═══

    [Fact]
    public async Task P2_toggle_free_to_paid_shows_pago_plan_price_not_snapshot_sum()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var fx = await BillingSeed.SeedFreeStoreAsync(_f);
        // The class-level HasPermission(StoresAdmin) gate grants an OwnerAdmin through
        // the store-modules of their SELECTED store (pinned by MyStoresTests M-05):
        // without SelectedStoreId the listing 403s BEFORE the handler — the backend
        // contract is correct, so the test must select the seeded store.
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            // AsTracking is REQUIRED: the context is NoTracking by default (CLAUDE.md
            // gotcha) — a non-tracked entity would make SaveChanges a silent no-op.
            var user = await db.Set<User>().IgnoreQueryFilters().AsTracking().FirstAsync(u => u.Id == fx.UserId);
            user.SelectedStoreId = fx.StoreId;
            await db.SaveChangesAsync();
        }
        try
        {
            // Toggle the seeded free store to Pago (the direction derives from StorePlanId).
            var client = DbTestHelpers.AuthedClient(_f, adminId, login);
            var r = await client.PostAsync($"/api/v1/stores/{fx.StoreId}/toggle-plan", null);
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            // The catalog price of the Pago plan, from GET /v1/plans.
            var expected = await GetPlanPriceAsync(client, "Pago");
            expected.Should().BeGreaterThan(0f, "the seeded catalog prices the Pago plan");

            // Diagnostic: read the owner's /me claim state and surface it in the
            // listing assertion so a 403 here is self-explaining.
            var meRes = await DbTestHelpers.AuthedClient(_f, fx.UserId, fx.Login).GetAsync("/api/v1/auth/me");
            MeData? me = meRes.StatusCode == HttpStatusCode.OK
                ? (await meRes.Content.ReadFromJsonAsync<ApiResponse<MeData>>(ApiResponse.Json))?.Data
                : null;
            string MeState() => me is null
                ? $"/me returned {meRes.StatusCode}"
                : $"/me: IsOwnerAdmin={me.IsOwnerAdmin}, SelectedStoreId={me.SelectedStoreId}, StoreModuleIds=[{string.Join(',', me.StoreModuleIds)}], FeatureIds=[{string.Join(',', me.FeatureIds)}]";

            var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, fx.UserId, fx.Login), MeState());
            var card = mine.Single(s => s.Id == fx.StoreId);
            card.PlanType.Should().Be("Pago", MeState());
            // ROJO hoy: the snapshot now carries EVERY paid catalog module (the toggle
            // activates them all) — the OLD snapshot-sum card showed more than the plan.
            card.PlanCurrentPrice.Should().NotBeNull();
            card.PlanCurrentPrice!.Value.Should().BeApproximately(expected, PriceTolerance,
                "after the toggle the card must show the Pago plan price, not the module-sum");
            card.PlanPrice.Should().BeGreaterThanOrEqualTo(card.PlanCurrentPrice!.Value);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ═══ P3 — live catalog price change flows to existing stores ═════════════

    [Fact]
    public async Task P3_catalog_price_change_reflects_on_existing_store_cards()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");
        try
        {
            Guid storeId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var store = Store.Create($"LIVE-{Guid.NewGuid():N}", owner.OwnerId, true, owner.TenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                db.Set<Store>().Add(store);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);
            var before = await GetPlanPriceAsync(client, "Pago");

            // Rewrite the catalog price of a Pago-plan module (Statistics, id 6) in place.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var rows = await db.Database.ExecuteSqlRawAsync(
                    "UPDATE \"Module\" SET \"Price\" = \"Price\" + 7 WHERE \"Id\" = 6");
                rows.Should().Be(1, "the seeded catalog must contain the Statistics module");
            }

            try
            {
                // NO store-module write ever happened — the card must still track the catalog.
                var after = await GetPlanPriceAsync(client, "Pago");
                after.Should().BeGreaterThan(before, "the live catalog now prices the plan higher");

                var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login), "the seeded owner-admin must pass the StoresAdmin gate");
                var card = mine.Single(s => s.Id == storeId);
                card.PlanCurrentPrice.Should().NotBeNull();
                card.PlanCurrentPrice!.Value.Should().BeApproximately(after, PriceTolerance,
                    "the card reads the live catalog — no frozen snapshot between the reads");
            }
            finally
            {
                // Restore the catalog price — the shared DB must not keep the +7.
                using var scope = _f.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Database.ExecuteSqlRawAsync(
                    "UPDATE \"Module\" SET \"Price\" = \"Price\" - 7 WHERE \"Id\" = 6");
            }
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    // ═══ P4 — change-plan updates the card price ═════════════════════════════

    [Fact]
    public async Task P4_change_plan_updates_card_price_to_target_plan()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var saLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        try
        {
            Guid storeId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var store = Store.Create($"CHG-{Guid.NewGuid():N}", owner.OwnerId, true, owner.TenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                db.Set<Store>().Add(store);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var mineBefore = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var before = mineBefore.Single(s => s.Id == storeId).PlanCurrentPrice;
            before.Should().NotBeNull();

            // Superior is SuperAdmin-reserved (caller matrix) — the flip runs as SA; the
            // card read stays on the owner's my-stores view, which is what P4 pins.
            var saClient = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var r = await saClient.PostAsJsonAsync($"/api/v1/stores/{storeId}/change-plan",
                new { storePlanId = (int)StorePlanType.Superior });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var mine = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var card = mine.Single(s => s.Id == storeId);
            card.PlanType.Should().Be("Superior");
            var expected = await GetPlanPriceAsync(client, "Superior");
            card.PlanCurrentPrice.Should().NotBeNull();
            card.PlanCurrentPrice!.Value.Should().BeApproximately(expected, PriceTolerance,
                "after the plan change the card shows the Superior catalog price");

            // The two plans must actually be priced differently in the seeded catalog —
            // otherwise the assertion above proves nothing.
            before!.Value.Should().NotBeApproximately(expected, PriceTolerance,
                "Pago and Superior must be priced differently");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ P5 — VIP sums the whole paid catalog ════════════════════════════════

    [Fact]
    public async Task P5_vip_card_price_matches_across_views()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            Guid storeId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var store = Store.Create($"VIP-{Guid.NewGuid():N}", owner.OwnerId, true, owner.TenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.VIP);
                db.Set<Store>().Add(store);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var mine = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var card = mine.Single(s => s.Id == storeId);
            card.PlanType.Should().Be("VIP");
            card.PlanCurrentPrice.Should().BeGreaterThan(0f);
            card.PlanPrice.Should().BeGreaterThanOrEqualTo(card.PlanCurrentPrice!.Value,
                "original (pre-discount) total ≥ current total");

            // VIP is excluded from GET /v1/plans; cross-check against the SuperAdmin view.
            var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
            var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");
            try
            {
                var list = await ListSuperStoresAsync(DbTestHelpers.AuthedClient(_f, superAdminId, superLogin));
                var super = list.Single(s => s.Id == storeId);
                super.PlanCurrentPrice.Should().NotBeNull();
                super.PlanCurrentPrice!.Value.Should().BeApproximately(card.PlanCurrentPrice!.Value, PriceTolerance,
                    "both views derive the VIP price from the same canonical formula");
            }
            finally
            {
                await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
            }
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
        }
    }

    // ═══ P6 — disapproved store: null canonical price ════════════════════════

    [Fact]
    public async Task P6_disapproved_store_exposes_null_canonical_prices()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            Guid storeId;
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var store = Store.Create($"DIS-{Guid.NewGuid():N}", owner.OwnerId, false, owner.TenantId,
                    paymentStartDate: null, storePlanId: (int)StorePlanType.Pago);
                db.Set<Store>().Add(store);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var mine = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var card = mine.Single(s => s.Id == storeId);
            card.Approved.Should().BeFalse();
            card.PlanCurrentPrice.Should().BeNull("disapproved stores expose no price");
            card.PlanPrice.Should().BeNull();
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
        }
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Owner-wide cleanup: deletes EVERY store of the owner (each with its
    /// StoreRoleFeature/StoreUser/StoreModule children) before the Owner row.
    /// Several tests here create ADDITIONAL stores for the seeded owner; the
    /// single-store AuthzSeed.CleanupStoreGraphAsync would leave them behind and
    /// the Owner delete would fail on FK_Store_Owner_OwnerId.
    /// </summary>
    private static async Task CleanupOwnerGraphAsync(AppTestFactory factory, Guid ownerId, params Guid[] userIds)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var storeIds = await db.Set<Store>().IgnoreQueryFilters()
            .Where(s => s.OwnerId == ownerId).Select(s => s.Id).ToListAsync();
        foreach (var storeId in storeIds)
        {
            await db.Set<StoreRoleFeature>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreUser>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
            await db.Set<StoreModule>().IgnoreQueryFilters().Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        }
        await db.Set<Store>().IgnoreQueryFilters().Where(s => s.OwnerId == ownerId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters().Where(o => o.Id == ownerId).ExecuteDeleteAsync();
        foreach (var uid in userIds)
        {
            await db.Set<UserRole>().IgnoreQueryFilters().Where(r => r.UserId == uid).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == uid).ExecuteDeleteAsync();
        }
    }

    private static async Task<List<OwnerStoreShape>> ListMyStoresAsync(HttpClient client, string because)
    {
        var res = await client.GetAsync("/api/v1/stores/my-stores");
        res.StatusCode.Should().Be(HttpStatusCode.OK, because);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreShape>>>(ApiResponse.Json))!.Data;
    }

    private static async Task<List<SuperStoreShape>> ListSuperStoresAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/stores/by-current-user");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<SuperStoreShape>>>(ApiResponse.Json))!.Data;
    }

    private static async Task<float> GetPlanPriceAsync(HttpClient client, string planType)
    {
        var res = await client.GetAsync("/api/v1/plans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var plans = (await res.Content.ReadFromJsonAsync<ApiResponse<List<PlanDtoShape>>>(ApiResponse.Json))!.Data;
        return plans.Single(p => p.PlanType == planType).Price;
    }
}
