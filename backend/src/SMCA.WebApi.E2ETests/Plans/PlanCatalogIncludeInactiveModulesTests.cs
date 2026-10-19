using System.Net;
using System.Net.Http.Json;
using Domain.Entities.Modules;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// module-inactive-grouping: the SuperAdmin-only <c>includeInactiveModules</c> opt-in on
/// <c>GET /v1/plans</c>.
///
/// The two SuperAdmin module editors must keep a deactivated catalog module grouped under the
/// plan it belongs to. That needs a plan's FULL membership, which the default read strips
/// (a module with <c>Module.IsActive == false</c> leaves <c>plan.modules</c>). This suite pins:
/// <list type="number">
///   <item>the default read still EXCLUDES the inactive module (non-regression for the
///   plan-change panels and owners);</item>
///   <item>the flag (SuperAdmin) INCLUDES it, carrying <c>isActive=false</c>;</item>
///   <item>the plan's <c>Price</c> counts only ACTIVE members, so the inactive module adds
///   nothing;</item>
///   <item>a non-SuperAdmin (OwnerAdmin) is REFUSED with the flag.</item>
/// </list>
///
/// MUTATION HYGIENE: the deactivation writes the SHARED seed catalog row that
/// <c>DbTestHelpers.ResetDataAsync</c> deliberately preserves, so the touched module is
/// snapshotted and restored in a <c>finally</c> through <c>ExecuteUpdateAsync</c>
/// (NoTracking-safe) — the same discipline <c>ModuleCatalogPricingTests</c> uses.
/// </summary>
[Collection("e2e")]
public sealed class PlanCatalogIncludeInactiveModulesTests
{
    private readonly AppTestFactory _f;
    public PlanCatalogIncludeInactiveModulesTests(WebAppFixture fixture) => _f = fixture.Factory;

    private const float Tolerance = 0.001f;

    /// <summary>In the ToStore universe, NOT PriceIncluded, carried by the seeded plans.</summary>
    private const int StatisticsModuleId = 6;

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
        public bool IsActive { get; set; }
        public bool PriceIncluded { get; set; }
        public float Price { get; set; }
        public float CurrentPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public float DiscountPrice { get; set; }
    }

    private sealed record ModuleSnapshot(int Id, bool IsActive);

    private async Task<List<PlanDtoShape>> GetPlansAsync(HttpClient client, bool includeInactiveModules)
    {
        var url = includeInactiveModules
            ? "/api/v1/plans?includeInactiveModules=true"
            : "/api/v1/plans";
        var res = await client.GetAsync(url);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = (await res.Content.ReadFromJsonAsync<ApiResponse<List<PlanDtoShape>>>(ApiResponse.Json))!;
        payload.Succeeded.Should().BeTrue();
        return payload.Data!;
    }

    private async Task<bool> IsModuleActiveAsync(int moduleId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.Id == moduleId).Select(m => m.IsActive).SingleAsync();
    }

    /// <summary>ExecuteUpdateAsync so the detached (NoTracking) entity still writes.</summary>
    private async Task SetModuleActiveAsync(int moduleId, bool isActive)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.Id == moduleId)
            .ExecuteUpdateAsync(set => set.SetProperty(m => m.IsActive, isActive));
    }

    /// <summary>The billable effective price of a plan, recomputed from its own response rows.</summary>
    private static float ExpectedPrice(IEnumerable<PlanModuleDtoShape> modules)
        => modules
            .Where(m => m.IsActive && !m.PriceIncluded)
            .Sum(m => m.CurrentPrice);

    [Fact]
    public async Task Flag_keeps_a_deactivated_module_under_its_plan_and_price_ignores_it()
    {
        var login = $"admin-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var wasActive = await IsModuleActiveAsync(StatisticsModuleId);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, saId, login);

            // Precondition: the target module is active and belongs to some plan, so the
            // assertions below cannot pass vacuously on a module no plan ever carries.
            wasActive.Should().BeTrue("precondition: the module must start active to prove the difference");
            var before = await GetPlansAsync(client, includeInactiveModules: false);
            var owningPlanType = before
                .Where(p => p.Modules.Any(m => m.ModuleId == StatisticsModuleId))
                .OrderBy(p => p.Order)
                .FirstOrDefault()
                ?.PlanType;
            owningPlanType.Should().NotBeNull(
                "precondition: module 6 must belong to a plan, otherwise the grouping claim is untestable");

            await SetModuleActiveAsync(StatisticsModuleId, false);

            // (1) Default read: the deactivated module leaves every plan's panel.
            var afterDefault = await GetPlansAsync(client, includeInactiveModules: false);
            afterDefault
                .SelectMany(p => p.Modules)
                .Should().NotContain(m => m.ModuleId == StatisticsModuleId,
                    "the default read must stay active-only for the plan-change panels");

            // (2) Flag read: it stays under its own plan, carrying isActive=false.
            var afterFlag = await GetPlansAsync(client, includeInactiveModules: true);
            var plan = afterFlag.Single(p => p.PlanType == owningPlanType);
            var row = plan.Modules.SingleOrDefault(m => m.ModuleId == StatisticsModuleId);
            row.Should().NotBeNull("the flag read must keep a deactivated module under its own plan");
            row!.IsActive.Should().BeFalse();

            // (3) Price counts only active members: the plan's Price equals the sum over its
            // ACTIVE, non-included rows — the inactive row contributes nothing.
            plan.Price.Should().BeApproximately(ExpectedPrice(plan.Modules), Tolerance,
                "an inactive module must not contribute to the plan price");
        }
        finally
        {
            await SetModuleActiveAsync(StatisticsModuleId, wasActive);
        }
    }

    [Fact]
    public async Task Flag_is_refused_for_a_non_superadmin()
    {
        var owner = await AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: false);
        try
        {
            var client = DbTestHelpers.AuthedClient(_f, owner.UserId, owner.Login);

            var res = await client.GetAsync("/api/v1/plans?includeInactiveModules=true");

            res.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "the inactive-module universe is a SuperAdmin editing concern only");
        }
        finally
        {
            await AuthzSeed.CleanupStoreGraphAsync(_f, owner.StoreId, owner.UserId);
        }
    }
}
