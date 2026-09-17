using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
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
/// E2E coverage for the permission flip a plan change causes on a REAL gated endpoint, with the
/// SAME Bearer token and no relogin (docs/plans/2026-09-15-store-plan-change-permission-refresh-plan.md,
/// §7.1 B2 — zero coverage before this test).
/// <para>
/// Endpoint chosen: <c>POST /api/v1/stores</c>. Its OwnerAdmin branch (CreateStoreCommand.cs:88-93)
/// is gated on the MultiStores module (14) of the caller's SELECTED store, evaluated through the
/// same chain the session uses (active StoreModules → FilterForBilling(billing.Status)).
/// MultiStores is exactly the plan-varying module: Pago(2) does NOT include module 14, while
/// Superior(3)/VIP(4) do (Plans/StorePlanCatalogTests.cs + StorePlanModuleEntityTypeConfiguration).
/// It is the only HTTP endpoint in the API whose outcome depends on a plan-varying module
/// (grep: the single Application-level ModuleType gate is CreateStoreCommand.cs:92).
/// Success code note: the action returns 201 Created on success (StoresController.CreateStoreAsync),
/// so the flip asserted here is 403 → 201 → 403. The action-level
/// <c>[HasPermission(SuperAdmin, StoresAdmin)]</c> filter passes in both directions (StoresAdmin
/// needs the Management feature, module 7, which every plan carries) — so the 403s come from the
/// handler's module gate, not from the authorization filter.
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class ChangePlanPermissionFlipTests
{
    private const int FreeManagementModuleId = (int)ModuleType.Management; // 7
    private const int MultiStoresModuleId = (int)ModuleType.MultiStores;   // 14

    private readonly AppTestFactory _f;
    public ChangePlanPermissionFlipTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Owner_same_token_multistores_gate_flips_403_created_403_across_plan_changes()
    {
        var g = await SeedOwnerStoreAsync(planId: (int)StorePlanType.Pago);
        var createdStores = new List<Guid>();
        try
        {
            // ONE client, ONE token for the whole test: 403 → plan change → 201 → plan change → 403.
            var client = DbTestHelpers.AuthedClient(_f, g.UserId, g.Login);

            // ── 1. Pago(2) has no MultiStores(14) → the second-store creation is forbidden. ──
            var deniedName = $"PF-Denied-{Guid.NewGuid():N}";
            var denied = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(deniedName));
            denied.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "the plan's module set does not include MultiStores (14)");

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == deniedName))
                    .Should().BeFalse("the handler rejects before persisting anything");
            }

            // ── 2. Owner upgrades Pago → Superior: MultiStores (14) joins the module set. ──
            await ChangePlanAsync(client, g.StoreId, StorePlanType.Superior);

            var allowedName = $"PF-Allowed-{Guid.NewGuid():N}";
            var allowed = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(allowedName));
            allowed.StatusCode.Should().Be(HttpStatusCode.Created,
                "the same token now passes the MultiStores gate — no relogin happened");
            var body = await allowed.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            var createdId = body.Data!.Id;
            createdStores.Add(createdId);

            // The created store inherits the selected store's module set, which now contains 14.
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var inherited = await db.Set<StoreModule>().IgnoreQueryFilters()
                    .Where(sm => sm.StoreId == createdId && sm.IsActive)
                    .Select(sm => sm.ModuleId).ToListAsync();
                inherited.Should().Contain(MultiStoresModuleId);
            }

            // ── 3. Downgrade Superior → Pago closes the gate again, SAME token. ──
            await ChangePlanAsync(client, g.StoreId, StorePlanType.Pago);

            var deniedAgainName = $"PF-Denied2-{Guid.NewGuid():N}";
            var deniedAgain = await client.PostAsJsonAsync("/api/v1/stores", OwnerBody(deniedAgainName));
            deniedAgain.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "MultiStores left the module set with the downgrade");

            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == deniedAgainName))
                    .Should().BeFalse("the handler rejects before persisting anything");
            }
        }
        finally
        {
            // Children before parents: the created store references the same Owner row that
            // CleanupStoreGraphAsync deletes afterwards.
            foreach (var id in createdStores)
                await StoreSeed.CleanupStoreAsync(_f, id);
            await AuthzSeed.CleanupStoreGraphAsync(_f, g.StoreId, g.UserId);
        }
    }

    // ── Seed helper ──────────────────────────────────────────────────────────

    private sealed record SeededOwnerStore(Guid UserId, string Login, Guid OwnerId, Guid StoreId);

    private sealed record StoreCreateBody(
        Guid OwnerId,
        string Name,
        string? Address,
        string? Description,
        bool Approved,
        int[] ModuleIds);

    // OwnerAdmin branch: zero-Guid OwnerId means "derive mine"; body ModuleIds are ignored
    // (the created store inherits the selected store's module set).
    private static StoreCreateBody OwnerBody(string name) =>
        new(Guid.Empty, name, "", "", true, Array.Empty<int>());

    /// <summary>
    /// LOCAL seed helper (does not touch the shared Infrastructure seeds — E2E-untouchable rule).
    /// OwnerAdmin owning one approved store on the given plan, NULL billing anchor (status
    /// NoAplica, so FilterForBilling is a no-op and only the plan decides) and the free Management
    /// module row. The store starts WITHOUT MultiStores (14): the plan change is what toggles it.
    /// </summary>
    private async Task<SeededOwnerStore> SeedOwnerStoreAsync(int planId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var login = $"pf-owner-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"),
            "E2E Plan Flip Owner", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Plan Flip owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"PF-Store-{Guid.NewGuid():N}", owner.Id, approved: true, tenantId,
            paymentStartDate: null, storePlanId: planId);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, FreeManagementModuleId, price: 0, modulePriceIncluded: true,
            modulePrice: 0, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return new SeededOwnerStore(user.Id, login, owner.Id, store.Id);
    }

    private static async Task ChangePlanAsync(HttpClient client, Guid storeId, StorePlanType plan)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/v1/stores/{storeId}/change-plan", new { storePlanId = (int)plan });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
