using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

/// <summary>
/// E2E tests for the DEACTIVATION invariant of <c>GET /api/v1/auth/me</c>, covering
/// every module and every OwnerAdmin-visible feature of the catalog: while an element is
/// active it appears in /me; once deactivated it stops appearing, and nothing else
/// changes.
/// <para>
/// Coverage is LINEAR (one case per module + one per OwnerAdmin feature), not exhaustive
/// (2^17 × 2^42 ≈ 600 billion combinations), because the system is deterministic — each
/// catalog element contributes independently to <c>StoreModuleIds</c>,
/// <c>FeatureIds</c> and <c>Roles</c>.
/// </para>
/// <para>
/// Catalog lists are read from the database at runtime (no hardcoding), so the sweep
/// auto-extends when a module or feature is added to the catalog.
/// Runtime chain under test: StoreModules(active) → FilterForBilling(NoAplica no-op)
/// → StoreModuleIds → FeatureIds (static StoreRoleFeatures enum ∩ catalog) / Roles
/// (StoreRoleFeature rows in DB).
/// </para>
/// </summary>
[Collection("e2e")]
public sealed class MeModuleFeatureDeactivationTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;

    public MeModuleFeatureDeactivationTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _f = fixture.Factory;
    }

    /// <summary>
    /// For EVERY available-to-store catalog module: while the module is active, /me shows
    /// it in <c>StoreModuleIds</c> with its OwnerAdmin features in <c>FeatureIds</c> and a
    /// <c>Roles</c> group; after soft-deleting the module (StoreModule.IsActive=false +
    /// its StoreRoleFeatures inactive — exactly what ApplyPlanModules does), the module,
    /// its features and its Roles group disappear, and every OTHER module/feature stays
    /// byte-for-byte unchanged.
    /// </summary>
    [Fact]
    public async Task Me_deactivated_module_disappears_from_me_keeping_others_intact()
    {
        var login = $"me-deact-mod-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithAllAvailableModulesAsync(login);
        try
        {
            var baseline = await MeAsync(seeded.UserId, login);
            var availableModuleIds = await AvailableModuleIdsAsync();
            var expectedByModule = await ExpectedOwnerAdminFeaturesByModuleAsync();

            // Coherence gate: with every module active, /me surfaces exactly the
            // OwnerAdmin-visible union of the catalog (enum ∩ active+available DB rows).
            baseline.Data!.StoreModuleIds.Should().BeEquivalentTo(availableModuleIds);
            baseline.Data.FeatureIds.Should()
                .BeEquivalentTo(expectedByModule.Values.SelectMany(v => v).OrderBy(id => id));
            // Roles groups per available module (presence only): production groups SRF rows
            // by (Store, Module) over NoTracking materialization, so the response can carry
            // one group per active row — duplicate module ids are expected, never asserted.
            baseline.Data.Roles.Select(r => r.ModuleId).Should().Contain(availableModuleIds);

            var failures = new List<string>();
            foreach (var moduleId in availableModuleIds)
            {
                try
                {
                    var expectedFeatures = expectedByModule[moduleId];

                    // Before: module active, its OwnerAdmin features visible, Roles group present.
                    baseline.Data.StoreModuleIds.Should().Contain(moduleId);
                    baseline.Data.FeatureIds.Should().Contain(expectedFeatures);
                    baseline.Data.Roles.Should().Contain(r => r.ModuleId == moduleId && r.FeatureIds.Contains(expectedFeatures[0]));

                    // Act: deactivate the module the same way ApplyPlanModules soft-deletes
                    // modules outside the plan universe.
                    await SetModuleActiveAsync(seeded.StoreId, moduleId, false);
                    await SetModuleRoleFeaturesActiveAsync(seeded.StoreId, moduleId, false);

                    var after = await MeAsync(seeded.UserId, login);

                    // After: the module is gone...
                    after.Data!.StoreModuleIds.Should().NotContain(moduleId);
                    after.Data.FeatureIds.Should().NotContain(expectedFeatures);
                    after.Data.Roles.Should().NotContain(r => r.ModuleId == moduleId);
                    // ...and everything else stays exactly as it was (no collateral damage).
                    after.Data.StoreModuleIds.Should()
                        .BeEquivalentTo(baseline.Data.StoreModuleIds.Where(id => id != moduleId));
                    after.Data.FeatureIds.Should()
                        .BeEquivalentTo(baseline.Data.FeatureIds.Except(expectedFeatures).OrderBy(id => id));
                }
                catch (Exception ex)
                {
                    failures.Add($"Module {moduleId}: {ex.Message}");
                }
                finally
                {
                    // Restore for the next case (idempotent reactivation, applies to all
                    // deactivated rows regardless of which assert failed).
                    await SetModuleActiveAsync(seeded.StoreId, moduleId, true);
                    await SetModuleRoleFeaturesActiveAsync(seeded.StoreId, moduleId, true);
                }
            }

            failures.Should().BeEmpty(string.Join(Environment.NewLine, failures));
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    /// <summary>
    /// For EVERY OwnerAdmin-visible catalog feature: while the feature is active, /me shows
    /// it in <c>FeatureIds</c> and in its module's <c>Roles</c> group; after deactivating
    /// it at the catalog level (Feature.IsActive=false — the real toggle that
    /// <c>FilterAvailableToStoreByIds</c> respects), the feature disappears from both, and
    /// everything else stays unchanged.
    /// <para>
    /// Documented gotcha: if the feature is the ONLY active+available feature of its
    /// module (modules 5, 6, 8, 11, 12, 14, 15, 16), deactivating it also drops the whole
    /// module from <c>StoreModuleIds</c>, because <c>GetAvailableModulesByStoreIdAsync</c>
    /// requires at least one active available feature per module. Both branches are
    /// asserted (module survives when it has sibling features, module drops otherwise).
    /// </para>
    /// </summary>
    [Fact]
    public async Task Me_deactivated_feature_disappears_from_me_keeping_others_intact()
    {
        var login = $"me-deact-feat-{Guid.NewGuid():N}@test.com";
        var seeded = await SeedOwnerAdminWithAllAvailableModulesAsync(login);
        try
        {
            var baseline = await MeAsync(seeded.UserId, login);
            var expectedByModule = await ExpectedOwnerAdminFeaturesByModuleAsync();
            var visibleFeatureIds = expectedByModule.Values.SelectMany(v => v).Distinct().OrderBy(id => id).ToList();

            // Sentinel: StorePayment (91) is SuperAdmin/ReSeller-only and has no module in
            // the enum — an OwnerAdmin never sees it, so it is OUTSIDE this sweep by
            // design. It must remain in the database (migration seed), untouched.
            baseline.Data!.FeatureIds.Should().NotContain((int)FeatureType.StorePayment);
            baseline.Data.FeatureIds.Should().BeEquivalentTo(visibleFeatureIds);

            // All 16 available modules are present before any feature is touched.
            baseline.Data.StoreModuleIds.Should()
                .BeEquivalentTo(await AvailableModuleIdsAsync());

            var failures = new List<string>();
            foreach (var featureId in visibleFeatureIds)
            {
                try
                {
                    var moduleId = await ModuleIdForFeatureAsync(featureId);
                    var moduleKeepsAnotherActiveFeature =
                        await ModuleHasAnotherActiveFeatureAsync(moduleId, featureId);

                    // Before: feature visible in FeatureIds and inside its module's Roles group.
                    baseline.Data.FeatureIds.Should().Contain(featureId);
                    baseline.Data.Roles.Should()
                        .Contain(r => r.ModuleId == moduleId && r.FeatureIds.Contains(featureId));

                    // Act: catalog-level deactivation (global toggle, restored in finally).
                    await SetFeatureActiveAsync(featureId, false);

                    var after = await MeAsync(seeded.UserId, login);

                    // After: the feature is gone from FeatureIds and from every Roles group...
                    after.Data!.FeatureIds.Should().NotContain(featureId);
                    after.Data.Roles.Should().NotContain(r => r.FeatureIds.Contains(featureId));
                    // ...and nothing else changed: FeatureIds lose exactly this feature.
                    after.Data.FeatureIds.Should()
                        .BeEquivalentTo(baseline.Data.FeatureIds.Where(id => id != featureId).OrderBy(id => id));

                    if (moduleKeepsAnotherActiveFeature)
                    {
                        // Sibling feature keeps the module alive.
                        after.Data.StoreModuleIds.Should()
                            .BeEquivalentTo(baseline.Data.StoreModuleIds);
                    }
                    else
                    {
                        // Documented gotcha: the last active feature takes its module with it.
                        after.Data.StoreModuleIds.Should()
                            .BeEquivalentTo(baseline.Data.StoreModuleIds.Where(id => id != moduleId));
                        after.Data.Roles.Should().NotContain(r => r.ModuleId == moduleId);
                    }
                }
                catch (Exception ex)
                {
                    failures.Add($"Feature {featureId}: {ex.Message}");
                }
                finally
                {
                    await SetFeatureActiveAsync(featureId, true);
                }
            }

            failures.Should().BeEmpty(string.Join(Environment.NewLine, failures));
        }
        finally
        {
            await CleanupStoreAndUserAsync(seeded.StoreId, seeded.UserId);
        }
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────

    private async Task<ApiResponse<CurrentUserDto>> MeAsync(Guid userId, string login)
    {
        var response = await DbTestHelpers.AuthedClient(_f, userId, login).GetAsync("/api/v1/auth/me");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body;
    }

    // ── Seed ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Seeds an OwnerAdmin user + Owner + Store (approved, paymentStartDate null → billing
    /// NoAplica → FilterForBilling no-op) + a StoreModule for EVERY available-to-store
    /// catalog module (read from the DB, so the seed auto-extends), plus the
    /// StoreRoleFeatures rows the real StoreRoleFeatureGenerator would create for those
    /// modules. Sets SelectedStoreId.
    /// </summary>
    private async Task<(Guid UserId, Guid OwnerId, Guid StoreId)> SeedOwnerAdminWithAllAvailableModulesAsync(string login)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var tenantId = DataUtils.DefaultTenant.Id;

        var user = User.Create(login, DbTestHelpers.HashPassword("Password123"), "E2E Me Deactivation", "0000000000", login, tenantId);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenantId, "E2E Me Deactivation Owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        var store = Store.Create($"Me-Deactivation-Store-{Guid.NewGuid():N}", owner.Id, true, tenantId, paymentStartDate: null);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        var modules = await db.Set<Module>()
            .Where(m => m.IsActive && m.AvailableToStore)
            .OrderBy(m => m.Order)
            .ToListAsync();
        foreach (var module in modules)
        {
            db.Set<StoreModule>().Add(StoreModule.Create(
                store.Id, module.Id, module.Price, module.PriceIncluded,
                module.Price, moduleDiscountPrice: 0, modulePercentDiscountPrice: 0, tenantId));
        }

        var moduleIds = modules.Select(m => m.Id).ToList();
        var featureIds = await db.Set<Feature>()
            .Where(f => f.IsActive && f.AvailableToStore && moduleIds.Contains(f.ModuleId))
            .Select(f => f.Id)
            .ToListAsync();

        // Real generator: maps features to roles via the StoreRoleFeatures enum; features
        // without an enum entry are silently dropped (documented gotcha).
        var generator = scope.ServiceProvider.GetRequiredService<Domain.Interfaces.Services.Tenants.IStoreRoleFeatureGenerator>();
        var roleFeatures = await generator.GenerateStoreRoleFeaturesAsync(store.Id, tenantId, featureIds);
        foreach (var srf in roleFeatures)
            db.Set<StoreRoleFeature>().Add(srf);

        user.SelectedStoreId = store.Id;
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenantId));
        await db.SaveChangesAsync();

        return (user.Id, owner.Id, store.Id);
    }

    // ── Catalog reads (DB-driven, auto-extensible) ────────────────────────

    private async Task<List<int>> AvailableModuleIdsAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Module>()
            .Where(m => m.IsActive && m.AvailableToStore)
            .OrderBy(m => m.Order)
            .Select(m => m.Id)
            .ToListAsync();
    }

    /// <summary>
    /// OwnerAdmin-visible features per available module, computed exactly like
    /// AllowedFeaturesService does: entries of the static StoreRoleFeatures enum that have
    /// the OwnerAdmin role, a feature type and a module type, intersected with the catalog
    /// rows that are IsActive &amp; AvailableToStore in the DB.
    /// </summary>
    private async Task<Dictionary<int, List<int>>> ExpectedOwnerAdminFeaturesByModuleAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var availableFeatureIds = await db.Set<Feature>()
            .Where(f => f.IsActive && f.AvailableToStore)
            .Select(f => new { f.Id, f.ModuleId })
            .ToListAsync();

        var result = new Dictionary<int, List<int>>();
        foreach (var moduleId in await AvailableModuleIdsAsync())
        {
            result[moduleId] = ((StoreRoleFeatures[])Enum.GetValues(typeof(StoreRoleFeatures)))
                .Where(rf => rf.GetRoles().Contains(RoleType.OwnerAdmin)
                    && rf.GetFeatureType().HasValue
                    && rf.GetModuleType().HasValue
                    && (int)rf.GetModuleType()!.Value == moduleId)
                .Select(rf => (int)rf.GetFeatureType()!.Value)
                .Where(id => availableFeatureIds.Any(f => f.Id == id && f.ModuleId == moduleId))
                .OrderBy(id => id)
                .ToList();
        }
        return result;
    }

    private async Task<int> ModuleIdForFeatureAsync(int featureId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Feature>()
            .Where(f => f.Id == featureId)
            .Select(f => f.ModuleId)
            .SingleAsync();
    }

    private async Task<bool> ModuleHasAnotherActiveFeatureAsync(int moduleId, int featureId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Feature>()
            .AnyAsync(f => f.ModuleId == moduleId && f.Id != featureId && f.IsActive && f.AvailableToStore);
    }

    // ── Mutations (ExecuteUpdateAsync bypasses the NoTracking gotcha) ─────

    private async Task SetModuleActiveAsync(Guid storeId, int moduleId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId && sm.ModuleId == moduleId)
            .ExecuteUpdateAsync(s => s.SetProperty(sm => sm.IsActive, isActive));
    }

    private async Task SetModuleRoleFeaturesActiveAsync(Guid storeId, int moduleId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(srf => srf.StoreId == storeId && srf.Feature.ModuleId == moduleId)
            .ExecuteUpdateAsync(s => s.SetProperty(srf => srf.IsActive, isActive));
    }

    private async Task SetFeatureActiveAsync(int featureId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        // Catalog-global toggle; the caller MUST restore it in finally. The "e2e"
        // collection is serial, so no other test observes the interim state.
        await db.Set<Feature>().IgnoreQueryFilters()
            .Where(f => f.Id == featureId)
            .ExecuteUpdateAsync(s => s.SetProperty(f => f.IsActive, isActive));
    }

    // ── Cleanup (children before parents, FK Restrict) ────────────────────

    private async Task CleanupStoreAndUserAsync(Guid storeId, Guid userId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(x => x.StoreId == storeId).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(x => x.Id == storeId).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(x => x.UserId == userId).ExecuteDeleteAsync();
        await db.Set<UserRole>().IgnoreQueryFilters()
            .Where(x => x.UserId == userId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters()
            .Where(x => x.Id == userId).ExecuteDeleteAsync();
    }
}