using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for the store-payment PRICE PARITY between the two store views
/// (docs/plans/2026-09-15-store-price-parity-plan.md):
/// the Owner's my-stores (GET /v1/stores/my-stores → OwnerStoreDto) and the
/// SuperAdmin listing (GET /v1/stores/by-current-user → StoreDto) must expose
/// the SAME paid-module snapshot per store, and that snapshot must be the
/// store's ACTIVE module set (Σ currentPrice of PriceIncluded=false, IsActive
/// rows) — dead rows left behind by a plan downgrade must never leak a price.
/// Four seeded plans: Gratis, Pago, Superior, and Pago-after-downgrade
/// (inactive Superior leftover row).
/// </summary>
[Collection("e2e")]
public sealed class StoreListPriceParityTests
{
    private readonly AppTestFactory _f;
    public StoreListPriceParityTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ModuleSnapshotDto(
        int Id, string? Name, bool PriceIncluded, float Price, float CurrentPrice);

    // my-stores (owner view) shape
    private sealed record OwnerStoreViewDto(
        Guid Id, string Name, bool IsActive, bool Approved, string PlanType,
        List<ModuleSnapshotDto> Modules);

    // by-current-user (superadmin view) shape
    private sealed record StoreViewDto(
        Guid Id, string Name, bool IsActive, bool Approved, string PlanType,
        List<ModuleSnapshotDto> Modules);

    private static List<ModuleSnapshotDto> PaidSet(List<ModuleSnapshotDto> modules) =>
        modules.Where(m => !m.PriceIncluded).OrderBy(m => m.Id).ToList();

    private static float PaidTotal(List<ModuleSnapshotDto> modules) =>
        PaidSet(modules).Sum(m => m.CurrentPrice);

    [Fact]
    public async Task Owner_and_superadmin_views_show_the_same_active_paid_snapshot_per_plan()
    {
        // Owner-admin graph (default approved store with Management module grants
        // StoresAdmin) — then FOUR stores under the SAME owner, one per plan scenario.
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var superLogin = $"admin-{Guid.NewGuid():N}@test.com";
        var superAdminId = await DbTestHelpers.SeedSuperAdminAsync(_f, superLogin, "Password123");

        Guid freeId, pagoId, superiorId, downgradedId;
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var tenantId = owner.TenantId;

            // Snapshot price constants: paid modules are priced 100 (Statistics, id 6)
            // and 500 (module 13) — explicit values so the expectations never couple
            // to the live catalog.
            const float price100 = 100f;
            const float price500 = 500f;

            var free = Store.Create($"Free-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                paymentStartDate: null, storePlanId: (int)StorePlanType.Gratis);
            var pago = Store.Create($"Pago-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                new DateOnly(2026, 1, 10), storePlanId: (int)StorePlanType.Pago);
            var superior = Store.Create($"Superior-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                new DateOnly(2026, 1, 10), storePlanId: (int)StorePlanType.Superior);
            // Same PLAN as `pago` but carrying a soft-deleted leftover row from a
            // simulated Superior → Pago downgrade (module 13, IsActive=false).
            var downgraded = Store.Create($"Downgraded-{Guid.NewGuid():N}", owner.OwnerId, true, tenantId,
                new DateOnly(2026, 1, 10), storePlanId: (int)StorePlanType.Pago);
            db.Set<Store>().AddRange(free, pago, superior, downgraded);
            await db.SaveChangesAsync();

            // Gratis: only the free module (Management, id 7).
            db.Set<StoreModule>().Add(StoreModule.Create(free.Id, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));

            // Pago: free module + Statistics paid @100 → canonical paid total 100.
            db.Set<StoreModule>().Add(StoreModule.Create(pago.Id, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(pago.Id, BillingSeed.StatisticsModuleId, price100, false, price100, 0, 0f, tenantId));

            // Superior: free + Statistics @100 + module 13 @500 → canonical 600.
            db.Set<StoreModule>().Add(StoreModule.Create(superior.Id, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(superior.Id, BillingSeed.StatisticsModuleId, price100, false, price100, 0, 0f, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(superior.Id, 13, price500, false, price500, 0, 0f, tenantId));

            // Pago-after-downgrade: ACTIVE set equal to the Pago universe…
            db.Set<StoreModule>().Add(StoreModule.Create(downgraded.Id, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, tenantId));
            db.Set<StoreModule>().Add(StoreModule.Create(downgraded.Id, BillingSeed.StatisticsModuleId, price100, false, price100, 0, 0f, tenantId));
            // …plus the DEAD row: module 13 leftover, soft-deleted, old price 500.
            var deadRow = StoreModule.Create(downgraded.Id, 13, price500, false, price500, 0, 0f, tenantId);
            deadRow.IsActive = false;
            db.Set<StoreModule>().Add(deadRow);

            await db.SaveChangesAsync();
            freeId = free.Id; pagoId = pago.Id; superiorId = superior.Id; downgradedId = downgraded.Id;
        }

        try
        {
            var ownerClient = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);
            var superClient = DbTestHelpers.AuthedClient(_f, superAdminId, superLogin);

            // ── Owner view: GET /v1/stores/my-stores ────────────────────────────
            var mineRes = await ownerClient.GetAsync("/api/v1/stores/my-stores");
            mineRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var mine = (await mineRes.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreViewDto>>>(ApiResponse.Json))!;
            mine.Succeeded.Should().BeTrue();
            var mineById = mine.Data.ToDictionary(s => s.Id);

            // ── SuperAdmin view: GET /v1/stores/by-current-user ─────────────────
            var listRes = await superClient.GetAsync("/api/v1/stores/by-current-user");
            listRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var list = (await listRes.Content.ReadFromJsonAsync<ApiResponse<List<StoreViewDto>>>(ApiResponse.Json))!;
            list.Succeeded.Should().BeTrue();
            var listById = list.Data.ToDictionary(s => s.Id);

            // ── PAR-1: parity — both views agree on plan name AND paid snapshot ─
            foreach (var storeId in new[] { freeId, pagoId, superiorId, downgradedId })
            {
                mineById.Should().ContainKey(storeId, "the owner view must list every seeded store");
                listById.Should().ContainKey(storeId, "the superadmin view must list every seeded store");
                mineById[storeId].PlanType.Should().Be(listById[storeId].PlanType,
                    $"plan name mismatch between views for store {storeId}");
                var minePaid = PaidSet(mineById[storeId].Modules);
                var listPaid = PaidSet(listById[storeId].Modules);
                minePaid.Should().BeEquivalentTo(listPaid, options => options
                        .Including(m => m.Id).Including(m => m.Price).Including(m => m.CurrentPrice),
                    $"paid-module snapshot must be identical in both views for store {storeId}");
            }

            // ── PAR-2: canonical totals per plan scenario ───────────────────────
            // Gratis: no paid modules at all.
            PaidSet(mineById[freeId].Modules).Should().BeEmpty();
            // Pago: exactly the Statistics @100 row → total 100.
            PaidTotal(mineById[pagoId].Modules).Should().Be(100f);
            // Superior: Statistics @100 + module 13 @500 → total 600.
            PaidTotal(mineById[superiorId].Modules).Should().Be(600f);
            // Pago-after-downgrade: the DEAD module-13 row (IsActive=false) must NOT
            // leak into the price — canonical total stays 100. With the repository
            // including soft-deleted rows this is 600 and the test fails (red).
            PaidTotal(mineById[downgradedId].Modules).Should().Be(100f,
                "a soft-deleted leftover row from a plan downgrade must never leak a price");
            PaidTotal(listById[downgradedId].Modules).Should().Be(100f,
                "same canonical rule on the superadmin listing view");

            // ── PAR-3: plan names read as seeded (guards the resolver wiring) ───
            mineById[freeId].PlanType.Should().Be("Gratis");
            mineById[pagoId].PlanType.Should().Be("Pago");
            mineById[superiorId].PlanType.Should().Be("Superior");
        }
        finally
        {
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var storeIds = new[] { freeId, pagoId, superiorId, downgradedId };
                db.Set<StoreModule>().RemoveRange(await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => storeIds.Contains(sm.StoreId)).ToListAsync());
                await db.SaveChangesAsync();
            }
            await StoreSeed.CleanupStoreAsync(_f, freeId);
            await StoreSeed.CleanupStoreAsync(_f, pagoId);
            await StoreSeed.CleanupStoreAsync(_f, superiorId);
            await StoreSeed.CleanupStoreAsync(_f, downgradedId);
            await DbTestHelpers.CleanupUserAsync(_f, superAdminId);
        }
    }
}
