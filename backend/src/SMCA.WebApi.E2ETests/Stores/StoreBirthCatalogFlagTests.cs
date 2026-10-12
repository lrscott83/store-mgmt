using System.Net;
using System.Net.Http.Json;
using Application.Dtos.StoreManagement;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
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
/// store-birth-superior (2026-10-11) — the catalog FLAG half of the birth invariant. BS1/BS2 in
/// <see cref="StoreBirthSuperiorTests"/> pin the happy path; these two prove the filter that
/// produces it is real: a Superior member whose <c>Module</c> row is retired by either flag is NOT
/// granted to a brand-new store, and nothing else about the birth changes.
///
/// Both tests flip ONE flag on ONE <c>Module</c> row and restore it in <c>finally</c>. The "e2e"
/// collection is serial, so no other test can observe the interim state; the restore keeps
/// <c>smca_test</c> clean for every later run.
/// </summary>
[Collection("e2e")]
public sealed class StoreBirthCatalogFlagTests
{
    private readonly AppTestFactory _f;
    public StoreBirthCatalogFlagTests(WebAppFixture fixture) => _f = fixture.Factory;

    /// <summary>
    /// Warehouses (13): a Superior member, no feature pinned to it in any other test's fixture, and
    /// not the module any gate in the creation path depends on — so flipping it moves ONLY the
    /// birth set. 7/14 stay untouched.
    /// </summary>
    private const int FlaggedModuleId = 13;

    [Fact]
    public async Task A_module_that_is_not_available_to_store_is_not_granted_at_birth()
    {
        var saLogin = $"sa-bf1-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        var before = await CatalogAsync();
        Guid created = Guid.Empty;
        try
        {
            // Precondition: the module is a Superior member that IS currently granted. Without it,
            // "absent from the birth set" is indistinguishable from "was never in the catalog".
            before.Should().Contain(FlaggedModuleId,
                "precondition: module 13 is a Superior member granted at birth");

            await SetAvailableToStoreAsync(FlaggedModuleId, false);
            var expectedCatalog = await CatalogAsync();
            expectedCatalog.Should().NotContain(FlaggedModuleId, "the flip must actually remove it from the catalog");
            expectedCatalog.Should().HaveCount(before.Count - 1, "and remove ONLY that one member");

            var response = await DbTestHelpers.AuthedClient(_f, adminId, saLogin)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BF1-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            var granted = await GrantedModuleIdsAsync(created);
            granted.Should().NotContain(FlaggedModuleId,
                "AvailableToStore = false must keep the module out of a brand-new store");
            granted.Should().BeEquivalentTo(expectedCatalog, "every other Superior member is still granted");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            // Restore LAST: the catalog flip must outlive the store it was measured against, but
            // never the run — smca_test must come back exactly as it was found.
            await SetAvailableToStoreAsync(FlaggedModuleId, true);
        }
    }

    [Fact]
    public async Task A_module_that_is_not_active_is_not_granted_at_birth()
    {
        var saLogin = $"sa-bf2-{Guid.NewGuid():N}@test.com";
        var adminId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var owner = await StoreSeed.SeedOwnerAsync(_f);
        var before = await CatalogAsync();
        Guid created = Guid.Empty;
        try
        {
            before.Should().Contain(FlaggedModuleId,
                "precondition: module 13 is a Superior member granted at birth");

            await SetIsActiveAsync(FlaggedModuleId, false);
            var expectedCatalog = await CatalogAsync();
            expectedCatalog.Should().NotContain(FlaggedModuleId, "the flip must actually remove it from the catalog");
            expectedCatalog.Should().HaveCount(before.Count - 1, "and remove ONLY that one member");

            var response = await DbTestHelpers.AuthedClient(_f, adminId, saLogin)
                .PostAsJsonAsync("/api/v1/stores", Body(owner.OwnerId, $"BF2-{Guid.NewGuid():N}"));
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            created = (await response.Content.ReadFromJsonAsync<ApiResponse<StoreData>>(ApiResponse.Json))!.Data!.Id;

            var granted = await GrantedModuleIdsAsync(created);
            granted.Should().NotContain(FlaggedModuleId,
                "IsActive = false must keep the module out of a brand-new store");
            granted.Should().BeEquivalentTo(expectedCatalog, "every other Superior member is still granted");
        }
        finally
        {
            if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);
            await StoreSeed.CleanupOwnerAsync(_f, owner.OwnerId, owner.UserId);
            await DbTestHelpers.CleanupUserAsync(_f, adminId);
            await SetIsActiveAsync(FlaggedModuleId, true);
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// <summary>The birth catalog, derived exactly like CreateStoreService derives it.</summary>
    private async Task<List<int>> CatalogAsync()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StorePlanModule>().IgnoreQueryFilters()
            .Where(spm => spm.PlanId == (int)StorePlanType.Superior
                && spm.Module.IsActive && spm.Module.AvailableToStore)
            .Select(spm => spm.ModuleId)
            .OrderBy(id => id)
            .ToListAsync();
    }

    private async Task<List<int>> GrantedModuleIdsAsync(Guid storeId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(sm => sm.StoreId == storeId && sm.IsActive)
            .Select(sm => sm.ModuleId)
            .OrderBy(id => id)
            .ToListAsync();
    }

    /// <summary>
    /// <c>ExecuteUpdateAsync</c> because <c>ApplicationDbContext</c> is NoTracking by default: load,
    /// mutate and save writes NOTHING, silently. <c>IgnoreQueryFilters</c> because there is no
    /// session here. Catalog-global toggle — the caller restores it in <c>finally</c>.
    /// </summary>
    private async Task SetIsActiveAsync(int moduleId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.Id == moduleId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, isActive));
    }

    private async Task SetAvailableToStoreAsync(int moduleId, bool availableToStore)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.Id == moduleId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.AvailableToStore, availableToStore));
    }

    private static object Body(Guid ownerId, string name) => new
    {
        OwnerId = ownerId,
        Name = name,
        Address = (string?)null,
        Description = (string?)null,
        Approved = true,
    };
}