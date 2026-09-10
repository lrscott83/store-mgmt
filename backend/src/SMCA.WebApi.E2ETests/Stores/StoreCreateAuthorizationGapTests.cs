using System.Net;
using System.Net.Http.Json;
using Domain.Common.Constants;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Stores;

// Asserts corrected authorization (H-10 + owner-multistores-store-creation, 2026-09-09):
// POST /v1/stores admits SuperAdmin (unchanged) and — NEW — an OwnerAdmin whose SELECTED
// store has the MultiStores module (14) active after billing filtering, creating ONLY for
// their own OwnerId. Action gate (StoresController.cs): [HasPermission(SuperAdmin, StoresAdmin)]
// yields a real HTTP 403 before the handler (R2.10/R2.11). Handler gate 2 (CreateStoreCommand):
//    1. !IsSuperAdmin && !IsOwnerAdmin -> 403 immediately (StoreUser with feature 73 hits this,
//       never a 400 — R2.14 defense in depth).
//    2. OwnerAdmin: ownOwner via GetByUserIdIgnoreQueryFiltersAsync; foreign/empty OwnerId,
//       missing selected store, or MultiStores (14) absent after billing filter -> 403 with no
//       Store/StoreModule row persisted and no SelectedStoreId re-point.
// The tests below pin the REJECTED side of that matrix:
//    - OwnerAdmin holding feature 73 but WITHOUT MultiStores (module 7 only) -> 403, no side effects.
//    - StoreUser granted feature 73 -> 403, not 400, no side effects.
//    - OwnerAdmin WITH MultiStores but a FOREIGN OwnerId -> 403, no side effects.
// The APPROVED side (owner + {7,14} -> 201) lives in OwnerCreateStoreTests (OC-04); the
// SuperAdmin 201 + persistence pin stays in StoreCreateTests.
// Coupling: these tests pin the corrected rule and MUST stay in sync with the action gate.
[Collection("e2e")]
public sealed class StoreCreateAuthorizationGapTests
{
    private readonly AppTestFactory _f;
    public StoreCreateAuthorizationGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
    { OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null, Approved = false, ModuleIds = moduleIds };

    [Fact]
    public async Task OwnerAdmin_with_stores_feature_gets_403_and_no_side_effects()
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, sa.UserId, sa.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(sa.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
            (await db.Set<Domain.Entities.StoreModules.StoreModule>().IgnoreQueryFilters()
                .AnyAsync(m => db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().Any(s => s.Id == m.StoreId && s.Name == name))).Should().BeFalse();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId);
            user.SelectedStoreId.Should().Be(sa.StoreId);
        }
        finally
        {
            // Nothing was persisted — only the seeded fixture graph needs cleanup.
            await StoreSeed.CleanupStoresAdminAsync(_f, sa);
        }
    }

    [Fact]
    public async Task Store_user_with_stores_feature_gets_403_not_400()
    {
        var f = await AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(f.OwnerId, name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId);
        }
    }

    [Fact]
    public async Task Owner_admin_with_multistores_and_foreign_owner_gets_403_and_no_side_effects()
    {
        // OwnerAdmin passes the action gate AND the MultiStores module check, but the body's
        // OwnerId names a DIFFERENT owner than the caller's own -> handler 403, nothing persisted,
        // SelectedStoreId untouched (owner-multistores contract: create ONLY for your own OwnerId).
        var f = await SeedOwnerAdminWithMultiStoresAsync(_f);
        var name = $"S-{Guid.NewGuid():N}";
        try
        {
            var response = await DbTestHelpers.AuthedClient(_f, f.UserId, f.Login)
                .PostAsJsonAsync("/api/v1/stores", Body(Guid.NewGuid(), name, new[] { StoreSeed.ManagementModuleId }));
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Domain.Entities.Stores.Store>().IgnoreQueryFilters().AnyAsync(s => s.Name == name)).Should().BeFalse();
            var user = await db.Set<Domain.Entities.Users.User>().IgnoreQueryFilters().FirstAsync(u => u.Id == f.UserId);
            user.SelectedStoreId.Should().Be(f.StoreId);
        }
        finally
        {
            // Nothing was persisted — only the seeded fixture graph needs cleanup.
            await StoreSeed.CleanupStoresAdminAsync(_f, f);
        }
    }

    /// <summary>
    /// LOCAL seed helper (duplicated from OwnerCreateStoreTests) — does NOT modify the shared
    /// StoreSeed/AuthzSeed classes (E2E-untouchable rule). OwnerAdmin + store with modules
    /// {7, 14} (MultiStores), billing AlDia (PaymentStartDate = today).
    /// </summary>
    private static async Task<StoreSeed.StoresAdminFixture> SeedOwnerAdminWithMultiStoresAsync(AppTestFactory factory)
    {
        var sa = await StoreSeed.SeedStoresAdminUserAsync(factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Set<Domain.Entities.StoreModules.StoreModule>().Add(
            Domain.Entities.StoreModules.StoreModule.Create(sa.StoreId, 14, 5, false, 5, 0, 0, DataUtils.DefaultTenant.Id));
        await db.SaveChangesAsync();
        return sa;
    }
}
