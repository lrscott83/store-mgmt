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
/// E2E coverage for the CARD PRICE RULE the product owner stated verbatim:
/// "the price a store must pay is the sum of all the modules it has assigned and that
/// are ACTIVE in its configuration". The Owner's my-stores listing
/// (GET /v1/stores/my-stores → OwnerStoreDto.PlanPrice/PlanCurrentPrice) and the
/// SuperAdmin listing (GET /v1/stores/by-current-user → StoreDto.PlanPrice/
/// PlanCurrentPrice) both expose that sum — the SAME number
/// <c>ModulePriceCalculator</c> produces for BillingService and the to-collect amount.
///
/// This file previously pinned the opposite rule (the 2026-09-15 "canonical plan price"
/// decision: Σ over the plan's member modules read from the live catalog). Every test
/// below still exercises the SAME scenario it always did; the expectation moved from
/// "the catalog total" to "the store's own assigned-and-active module sum", which is
/// what a store whose snapshot differs from its plan is actually charged.
///
/// Note on the plan price: it is still cross-checked against GET /v1/plans in several
/// tests. It is a legitimate expectation ONLY where the store's snapshot happens to
/// mirror the plan universe — which is exactly what the plan-toggle and change-plan
/// commands produce, because both rewrite the snapshot from the catalog.
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

    private const int StatisticsModuleId = 6;
    private const int WarehousesModuleId = 13;

    // ═══ P1 — the card shows each store's OWN snapshot sum, on both views ══════

    [Fact]
    public async Task P1_card_price_is_each_stores_own_snapshot_sum_on_both_views()
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

                // Explicit snapshot prices, deliberately NOT the catalog's — so the
                // expectation never moves with a catalog edit.
                // Gratis: only the bundled Management row → nothing bills.
                AddStoreModule(db, free.Id, tenantId, 7, price: 0f, priceIncluded: true);
                // Pago: Statistics @120, no discount → base 120, current 120.
                AddStoreModule(db, pago.Id, tenantId, StatisticsModuleId, price: 120f);
                // Superior: Statistics @120 + Warehouses @333 with 20% off
                // → base 453, current 120 + 266.4 = 386.4.
                AddStoreModule(db, superior.Id, tenantId, StatisticsModuleId, price: 120f);
                AddStoreModule(db, superior.Id, tenantId, WarehousesModuleId, price: 333f, percentDiscount: 20f);

                await db.SaveChangesAsync();
                freeId = free.Id;
                pagoId = pago.Id;
                superiorId = superior.Id;
            }

            var superClient = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);
            var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login), "the seeded owner-admin must pass the StoresAdmin gate");
            var list = await ListSuperStoresAsync(superClient);

            // Pago: the card shows the store's own 120/120 — on BOTH views.
            var minePago = mine.Single(s => s.Id == pagoId);
            minePago.PlanType.Should().Be("Pago");
            minePago.PlanPrice.Should().NotBeNull();
            minePago.PlanCurrentPrice.Should().NotBeNull();
            minePago.PlanPrice!.Value.Should().BeApproximately(120f, PriceTolerance,
                "PlanPrice is Σ Price over the store's own ACTIVE, not-price-included rows");
            minePago.PlanCurrentPrice!.Value.Should().BeApproximately(120f, PriceTolerance,
                "no discount on the seeded row, so base and current agree");

            var listSuperior = list.Single(s => s.Id == superiorId);
            listSuperior.PlanType.Should().Be("Superior");
            listSuperior.PlanPrice.Should().NotBeNull();
            listSuperior.PlanCurrentPrice.Should().NotBeNull();
            listSuperior.PlanPrice!.Value.Should().BeApproximately(453f, PriceTolerance,
                "the SuperAdmin listing sums the store's own rows, not the plan's");
            listSuperior.PlanCurrentPrice!.Value.Should().BeApproximately(386.4f, PriceTolerance,
                "each row at its effective price — Warehouses carries the 20% discount");

            // Gratis: zero-price members — both fields are 0, not null.
            var mineFree = mine.Single(s => s.Id == freeId);
            mineFree.PlanType.Should().Be("Gratis");
            mineFree.PlanCurrentPrice.Should().Be(0f);
            mineFree.PlanPrice.Should().Be(0f);
            var listFree = list.Single(s => s.Id == freeId);
            listFree.PlanCurrentPrice.Should().Be(0f);
            listFree.PlanPrice.Should().Be(0f);

            // The seeded snapshots are priced away from the catalog on purpose, so the
            // card must NOT equal the plan-catalog totals.
            var plans = await GetPlansAsync(superClient);
            listSuperior.PlanCurrentPrice!.Value.Should().NotBeApproximately(plans["Superior"], PriceTolerance,
                "the Superior card reads the store's snapshot, not the whole catalog");
            minePago.PlanCurrentPrice!.Value.Should().NotBeApproximately(plans["Pago"], PriceTolerance,
                "the Pago card reads the store's snapshot, not the whole catalog");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }

    // ═══ P2 — toggle Free→Paid: the card shows every activated paid module ═════

    [Fact]
    public async Task P2_toggle_free_to_paid_shows_the_sum_of_every_activated_paid_module()
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

            // The store now OWNS an assigned set of paid modules; the card must be that
            // set's sum, read straight from the StoreModule rows.
            var (expectedBase, expectedCurrent) = await ReadSnapshotTotalsAsync(_f, fx.StoreId);
            expectedCurrent.Should().BeGreaterThan(0f, "the toggle activates the paid modules");

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
            card.PlanCurrentPrice.Should().NotBeNull();
            card.PlanCurrentPrice!.Value.Should().BeApproximately(expectedCurrent, PriceTolerance,
                "the card is the billing sum over the modules the toggle just activated");
            card.PlanPrice.Should().NotBeNull();
            card.PlanPrice!.Value.Should().BeApproximately(expectedBase, PriceTolerance,
                "the original column covers the same rows, at their pre-discount Price");

            // The toggle activates EVERY paid catalog module, not only the Pago plan's
            // members — so the card legitimately exceeds the plan-catalog total. This is
            // the exact divergence the old plan-keyed rule hid from the owner.
            var planPrice = (await GetPlansAsync(client))["Pago"];
            card.PlanCurrentPrice!.Value.Should().NotBeApproximately(planPrice, PriceTolerance,
                "a store that owns modules outside the plan's members must not be shown the plan total");
            card.PlanPrice.Should().BeGreaterThanOrEqualTo(card.PlanCurrentPrice!.Value);
        }
        finally
        {
            await BillingSeed.CleanupAsync(_f, fx);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
        }
    }

    // ═══ P3 — a live catalog price edit does NOT move the card ════════════════

    [Fact]
    public async Task P3_catalog_price_change_does_not_move_the_card_price()
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
                // The store's own assigned price for Statistics — priced away from the
                // catalog so the two can never be confused for one another.
                AddStoreModule(db, store.Id, owner.TenantId, StatisticsModuleId, price: 137f);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);
            var mine0 = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login), "the seeded owner-admin must pass the StoresAdmin gate");
            var before = mine0.Single(s => s.Id == storeId).PlanCurrentPrice;
            before.Should().NotBeNull();
            before!.Value.Should().BeApproximately(137f, PriceTolerance,
                "the card reads the store's assigned price");

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
                // Prove the manipulation actually moved the catalog price…
                var after = (await GetPlansAsync(client))["Pago"];
                var beforePlan = before.Value;
                after.Should().NotBeApproximately(beforePlan, PriceTolerance,
                    "the live catalog now prices the plan differently");

                // …and that the card, which reads the store's own assigned rows, did not move.
                var mine = await ListMyStoresAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login), "the seeded owner-admin must pass the StoresAdmin gate");
                var card = mine.Single(s => s.Id == storeId);
                card.PlanCurrentPrice.Should().NotBeNull();
                card.PlanCurrentPrice!.Value.Should().BeApproximately(beforePlan, PriceTolerance,
                    "the card reads the store's own assigned price — a catalog edit cannot move it");
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

    // ═══ P4 — change-plan rewrites the snapshot, and the card follows it ══════

    [Fact]
    public async Task P4_change_plan_rewrites_the_snapshot_and_the_card_follows_it()
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
                // A Pago snapshot that is NOT the catalog's — so "before" is a real
                // store-owned total rather than a copy of the plan price.
                AddStoreModule(db, store.Id, owner.TenantId, StatisticsModuleId, price: 77f);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var mineBefore = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var before = mineBefore.Single(s => s.Id == storeId).PlanCurrentPrice;
            before.Should().NotBeNull();
            before!.Value.Should().BeApproximately(77f, PriceTolerance,
                "before the change the card shows the store's own assigned price");

            // Superior is SuperAdmin-reserved (caller matrix) — the flip runs as SA; the
            // card read stays on the owner's my-stores view, which is what P4 pins.
            var saClient = DbTestHelpers.AuthedClient(_f, saId, saLogin);
            var r = await saClient.PostAsJsonAsync($"/api/v1/stores/{storeId}/change-plan",
                new { storePlanId = (int)StorePlanType.Superior });
            r.StatusCode.Should().Be(HttpStatusCode.OK);

            var mine = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var card = mine.Single(s => s.Id == storeId);
            card.PlanType.Should().Be("Superior");

            // change-plan makes the store's active set equal the target plan's universe
            // and re-prices it from the catalog — so the card now follows the REWRITTEN
            // snapshot, which is the same total the plan catalog reports.
            var (expectedBase, expectedCurrent) = await ReadSnapshotTotalsAsync(_f, storeId);
            card.PlanCurrentPrice.Should().NotBeNull();
            card.PlanCurrentPrice!.Value.Should().BeApproximately(expectedCurrent, PriceTolerance,
                "the card tracks the snapshot the plan change just wrote");
            card.PlanPrice.Should().NotBeNull();
            card.PlanPrice!.Value.Should().BeApproximately(expectedBase, PriceTolerance,
                "the original column covers those same rows");

            // The card must have MOVED — otherwise the assertion above proves nothing.
            card.PlanCurrentPrice!.Value.Should().NotBeApproximately(before.Value, PriceTolerance,
                "switching to Superior assigns more paid modules than the store had");
        }
        finally
        {
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    // ═══ P5 — VIP card price matches across views ═════════════════════════════

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
                // Statistics @250 + Warehouses @150 with 10% off
                // → base 400, current 250 + 135 = 385.
                AddStoreModule(db, store.Id, owner.TenantId, StatisticsModuleId, price: 250f);
                AddStoreModule(db, store.Id, owner.TenantId, WarehousesModuleId, price: 150f, percentDiscount: 10f);
                await db.SaveChangesAsync();
                storeId = store.Id;
            }

            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var mine = await ListMyStoresAsync(client, "the seeded owner-admin must pass the StoresAdmin gate");
            var card = mine.Single(s => s.Id == storeId);
            card.PlanType.Should().Be("VIP");
            card.PlanCurrentPrice.Should().BeApproximately(385f, PriceTolerance,
                "the card sums the store's own ACTIVE, not-price-included rows");
            card.PlanPrice.Should().BeApproximately(400f, PriceTolerance,
                "the original column is the same rows at their pre-discount Price");
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
                    "both views derive the VIP price from the same store snapshot");
                super.PlanPrice.Should().NotBeNull();
                super.PlanPrice!.Value.Should().BeApproximately(card.PlanPrice!.Value, PriceTolerance,
                    "both views expose the same original total too");
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

    // ═══ P6 — disapproved store: null prices ═════════════════════════════════

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

    private static void AddStoreModule(
        ApplicationDbContext db, Guid storeId, Guid tenantId, int moduleId,
        float price, bool priceIncluded = false, float percentDiscount = 0f, float fixedDiscount = 0f)
        => db.Set<StoreModule>().Add(
            StoreModule.Create(storeId, moduleId, price, priceIncluded, price, fixedDiscount, percentDiscount, tenantId));

    /// <summary>
    /// The store's own totals, computed from its StoreModule rows with the billing rule
    /// restated here (ACTIVE + not price-included; current = price − % − fixed). Used
    /// where a COMMAND rewrites the snapshot, so the expectation comes from the data the
    /// command actually wrote rather than from a hard-coded number.
    /// </summary>
    private static async Task<(float Base, float Current)> ReadSnapshotTotalsAsync(AppTestFactory factory, Guid storeId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var rows = await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId && sm.IsActive && !sm.ModulePriceIncluded)
            .ToListAsync();
        float baseline = 0f;
        float current = 0f;
        foreach (var row in rows)
        {
            baseline += row.Price;
            current += row.Price - row.Price * row.ModulePercentDiscountPrice / 100 - row.ModuleDiscountPrice;
        }
        return (baseline, current);
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

    private static async Task<Dictionary<string, float>> GetPlansAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/plans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var plans = (await res.Content.ReadFromJsonAsync<ApiResponse<List<PlanDtoShape>>>(ApiResponse.Json))!.Data;
        return plans.ToDictionary(p => p.PlanType, p => p.Price);
    }
}
