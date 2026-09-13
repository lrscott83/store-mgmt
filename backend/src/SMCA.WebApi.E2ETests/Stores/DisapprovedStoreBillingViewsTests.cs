using System.Net;
using System.Net.Http.Json;
using Domain.Common.Enums;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

/// <summary>
/// E2E coverage for the disapproved-store billing views (2026-09-13):
/// a store with Approved=false must read as free on EVERY store-view surface
/// — "Gratis" plan name and null payment/due dates — even when its billing data
/// looks paid: non-null PaymentStartDate, paid snapshot modules, and a recorded
/// StorePayment row in the past. The approved-run control store proves the same
/// data shape keeps its paid plan and computed dates.
/// </summary>
[Collection("e2e")]
public sealed class DisapprovedStoreBillingViewsTests
{
    private readonly AppTestFactory _f;
    public DisapprovedStoreBillingViewsTests(WebAppFixture fixture) => _f = fixture.Factory;

    // By-current-user (admin-stores page): StoreDto
    private sealed record StoreViewData(
        Guid Id, string PlanType, DateOnly? PaymentStartDate, DateOnly? NextPaymentDate);

    // My-stores (owner-stores-cards): OwnerStoreDto
    private sealed record OwnerStoreViewData(
        Guid Id, string PlanType, DateOnly? PaymentStartDate, DateOnly? NextDueDate);

    // GET /stores/{id}/plan: StorePlanDto
    private sealed class PlanViewData
    {
        public Guid StoreId { get; set; }
        public string PlanType { get; set; } = string.Empty;
        public DateOnly? PaymentStartDate { get; set; }
        public DateOnly? NextDueDate { get; set; }
    }

    [Fact]
    public async Task Owner_sees_disapproved_store_as_gratis_with_null_dates_on_all_three_views()
    {
        // Seed the OWNER ADMIN graph (default approved store with Management module
        // grants StoresAdmin) — then add TWO stores under the SAME owner: the
        // disapproved target and the approved control. Both get the paid snapshot
        // modules (Management + Statistics) and a running billing clock.
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        var start = new DateOnly(2026, 1, 10);
        var legacyPaidBefore = new DateTimeOffset(2025, 12, 31, 12, 0, 0, TimeSpan.Zero);
        Guid disStoreId, ctrlStoreId;
        using (var scope = _f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var dis = Store.Create($"Disapproved-{Guid.NewGuid():N}", owner.OwnerId, false, owner.TenantId,
                start, storePlanId: (int)StorePlanType.Pago);
            var ctrl = Store.Create($"Approved-{Guid.NewGuid():N}", owner.OwnerId, true, owner.TenantId,
                start, storePlanId: (int)StorePlanType.Pago);
            db.Set<Store>().Add(dis);
            db.Set<Store>().Add(ctrl);
            await db.SaveChangesAsync();

            // Paid snapshot on BOTH stores: free Management (PriceIncluded=true) +
            // paid Statistics (PriceIncluded=false, price 2000).
            foreach (var storeId in new[] { dis.Id, ctrl.Id })
            {
                db.Set<StoreModule>().Add(StoreModule.Create(storeId, BillingSeed.ManagementModuleId, 0, true, 0, 0, 0, owner.TenantId));
                db.Set<StoreModule>().Add(StoreModule.Create(storeId, BillingSeed.StatisticsModuleId, 2000f, false, 2000f, 0, 0f, owner.TenantId));
            }
            // Legacy recorded payment on the DISAPPROVED store: status Paid,
            // PaymentBeforeDate in the past — must NOT resurrect a date for it.
            db.Set<StorePayment>().Add(StorePayment.Create(
                dis.Id, (int)StorePaymentStatusType.Paid, 2000f,
                legacyPaidBefore, legacyPaidBefore.Year, legacyPaidBefore.Month,
                owner.TenantId, null, 0f, 0f, 0f, false));
            await db.SaveChangesAsync();

            disStoreId = dis.Id;
            ctrlStoreId = ctrl.Id;
        }

        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);

            // ── GET /api/v1/stores/by-current-user ──────────────────────────────
            var byCurrent = await client.GetAsync("/api/v1/stores/by-current-user");
            byCurrent.StatusCode.Should().Be(HttpStatusCode.OK);
            var list = await byCurrent.Content.ReadFromJsonAsync<ApiResponse<List<StoreViewData>>>(ApiResponse.Json);
            list!.Succeeded.Should().BeTrue();
            // REQ-1 + REQ-2: the disapproved store reads "Gratis" and the running clock
            // (PaymentStartDate set) hides nothing — the date itself must be null.
            list.Data.Should().Contain(s => s.Id == disStoreId
                && s.PlanType == "Gratis"
                && s.PaymentStartDate != null
                && s.NextPaymentDate == null);
            // Control: identical billing data, approved → paid plan and computed date.
            list.Data.Should().Contain(s => s.Id == ctrlStoreId
                && s.PlanType == "Pago"
                && s.NextPaymentDate != null);

            // ── GET /api/v1/stores/my-stores ────────────────────────────────────
            var myStores = await client.GetAsync("/api/v1/stores/my-stores");
            myStores.StatusCode.Should().Be(HttpStatusCode.OK);
            var mine = await myStores.Content.ReadFromJsonAsync<ApiResponse<List<OwnerStoreViewData>>>(ApiResponse.Json);
            mine!.Succeeded.Should().BeTrue();
            mine.Data.Should().Contain(s => s.Id == disStoreId
                && s.PlanType == "Gratis"
                && s.PaymentStartDate != null
                && s.NextDueDate == null);
            mine.Data.Should().Contain(s => s.Id == ctrlStoreId
                && s.PlanType == "Pago"
                && s.NextDueDate != null);

            // ── GET /api/v1/stores/{id}/plan (both stores) ──────────────────────
            var disPlan = await client.GetAsync($"/api/v1/stores/{disStoreId}/plan");
            disPlan.StatusCode.Should().Be(HttpStatusCode.OK);
            var plan1 = await disPlan.Content.ReadFromJsonAsync<ApiResponse<PlanViewData>>(ApiResponse.Json);
            plan1!.Succeeded.Should().BeTrue();
            plan1.Data!.PlanType.Should().Be("Gratis");
            plan1.Data.PaymentStartDate.Should().Be(start);
            // The past recorded payment must NOT win: even with PaymentStartDate set,
            // the disapproved store reports no due date.
            plan1.Data.NextDueDate.Should().BeNull();

            var ctrlPlan = await client.GetAsync($"/api/v1/stores/{ctrlStoreId}/plan");
            ctrlPlan.StatusCode.Should().Be(HttpStatusCode.OK);
            var plan2 = await ctrlPlan.Content.ReadFromJsonAsync<ApiResponse<PlanViewData>>(ApiResponse.Json);
            plan2!.Succeeded.Should().BeTrue();
            plan2.Data!.PlanType.Should().Be("Pago");
            // Canonical: start + trial(1) + 1 post-paid month.
            plan2.Data.NextDueDate.Should().Be(new DateOnly(2026, 3, 10));
        }
        finally
        {
            // Reverse dependency order: StorePayment → StoreModule → Store → owner graph.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Set<StorePayment>().RemoveRange(await db.Set<StorePayment>().IgnoreQueryFilters()
                .Where(sp => sp.StoreId == disStoreId || sp.StoreId == ctrlStoreId).ToListAsync());
            await db.SaveChangesAsync();
            await StoreSeed.CleanupStoreAsync(_f, disStoreId);
            await StoreSeed.CleanupStoreAsync(_f, ctrlStoreId);
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }
}