using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Domain.Common.Enums;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
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

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// Plan 2026-09-21 (docs/plans/2026-09-21-superadmin-plan-catalog-vip-multimonedas.md):
/// GET /v1/plans visibility by caller.
/// - PC1: SuperAdmin sees ALL active plans — VIP (4) included — so the SuperAdmin
///   change-plan popup can offer the VIP switch.
/// - PC2: OwnerAdmin keeps the classic 3-plan catalog (Gratis/Pago/Superior); VIP
///   stays SuperAdmin-reserved and never reaches an owner's plan page.
/// - PC3: the SERVED Superior catalog includes module 15 "Múltiples monedas"
///   (the exact claim that failed on the user's environment).
/// - PC4: the SERVED VIP catalog includes its exclusive modules 15/16/17.
/// Migration/scripts are untouched: the EF seed already inserts StorePlanModule
/// {15→3} and {15→4} (E2E StorePlanCatalogTests pins the matrix).
/// </summary>
[Collection("e2e")]
public sealed class PlanCatalogVisibilityTests
{
    private readonly AppTestFactory _f;
    public PlanCatalogVisibilityTests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed class PlanDtoShape
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Order { get; set; }
        public string PlanType { get; set; } = string.Empty;
        public float Price { get; set; }
        public List<PlanModuleDtoShape> Modules { get; set; } = new();
    }

    private sealed class PlanModuleDtoShape
    {
        public int ModuleId { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Order { get; set; }
        public bool PriceIncluded { get; set; }
        public float Price { get; set; }
        public float CurrentPrice { get; set; }
        public float DiscountPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public string? DiscountText { get; set; }
        [JsonPropertyName("featureDescriptions")]
        public List<string> FeatureDescriptions { get; set; } = new();
    }

    private static async Task<List<PlanDtoShape>> GetPlansAsync(HttpClient client)
    {
        var res = await client.GetAsync("/api/v1/plans");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = (await res.Content.ReadFromJsonAsync<ApiResponse<List<PlanDtoShape>>>(ApiResponse.Json))!;
        payload.Succeeded.Should().BeTrue();
        return payload.Data!;
    }

    [Fact]
    public async Task PC1_superadmin_catalog_includes_vip()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var plans = await GetPlansAsync(DbTestHelpers.AuthedClient(_f, saId, login));

            plans.Select(p => p.PlanType).Should().ContainInOrder("Gratis", "Pago", "Superior", "VIP");
            plans.Single(p => p.PlanType == "VIP").Id.Should().Be(4);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task PC2_owneradmin_catalog_excludes_vip()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true);
        try
        {
            var plans = await GetPlansAsync(DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login));

            plans.Select(p => p.PlanType).Should().ContainInOrder("Gratis", "Pago", "Superior");
            plans.Select(p => p.PlanType).Should().NotContain("VIP");
        }
        finally
        {
            // Owner graph only — NEVER CleanupTenantCascadeAsync: AuthzSeed owners live in
            // the DefaultTenant and a tenant-wide delete would erase the migration seed
            // (regression seen live: OwnersDeleteReferencesTests.Delete_owner_default_tenant_survives).
            await CleanupOwnerGraphAsync(_f, owner.OwnerId, owner.UserId);
        }
    }

    [Fact]
    public async Task PC3_superior_catalog_serves_multimonedas_module()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var plans = await GetPlansAsync(DbTestHelpers.AuthedClient(_f, saId, login));

            var superior = plans.Single(p => p.PlanType == "Superior");
            var multimonedas = superior.Modules.Single(m => m.ModuleId == 15);
            multimonedas.Name.Should().Be("Múltiples monedas");
            // Catalog price parity: list 3 USD with a 100% percent discount → 0 USD now.
            multimonedas.Price.Should().Be(3f);
            multimonedas.PercentDiscountPrice.Should().Be(100f);
            multimonedas.CurrentPrice.Should().Be(0f);
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    [Fact]
    public async Task PC4_vip_catalog_serves_its_module_matrix()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var plans = await GetPlansAsync(DbTestHelpers.AuthedClient(_f, saId, login));

            var vip = plans.Single(p => p.PlanType == "VIP");
            vip.Modules.Select(m => m.ModuleId).Should().Contain(new[] { 15, 16, 17 });
            vip.Modules.Should().Contain(m => m.ModuleId == 16 && m.Name == "Múltiples pagos");
        }
        finally
        {
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }

    /// <summary>
    /// FK-safe owner-graph cleanup (same pattern as
    /// StorePlanCanonicalPriceTests.CleanupOwnerGraphAsync): per-store children first,
    /// then Store → Owner → User. Touches nothing outside the seeded owner's graph —
    /// the DefaultTenant row stays untouched.
    /// </summary>
    private static async Task CleanupOwnerGraphAsync(AppTestFactory factory, Guid ownerId, Guid userId)
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
        await db.Set<UserRole>().IgnoreQueryFilters().Where(r => r.UserId == userId).ExecuteDeleteAsync();
        await db.Set<User>().IgnoreQueryFilters().Where(u => u.Id == userId).ExecuteDeleteAsync();
    }
}
