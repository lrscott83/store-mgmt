using Domain.Common.Enums;
using Domain.Entities.Plans;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Plans;

/// <summary>
/// Verifies the StorePlanModule seed matrix produced by
/// StorePlanModuleEntityTypeConfiguration.HasData against the documented plan structure.
/// The live seed is authoritative — if the code differs from the plan text, the code wins
/// and the discrepancy is reported.
/// Plan 2026-09-08-e2e-plan-gated-modules-auth-roster (Integration-contract item 3).
/// </summary>
[Collection("e2e")]
public sealed class StorePlanCatalogTests
{
    private readonly AppTestFactory _f;
    public StorePlanCatalogTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task StorePlanModule_seed_matches_documented_plan_matrix()
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var allModules = await db.Set<StorePlanModule>()
            .IgnoreQueryFilters()
            .ToListAsync();

        var modulesByPlan = allModules
            .GroupBy(spm => spm.PlanId)
            .ToDictionary(g => g.Key, g => g.Select(spm => spm.ModuleId).OrderBy(id => id).ToList());

        var gratis = modulesByPlan[(int)StorePlanType.Gratis];
        var pago = modulesByPlan[(int)StorePlanType.Pago];
        var superior = modulesByPlan[(int)StorePlanType.Superior];
        var vip = modulesByPlan[(int)StorePlanType.VIP];

        // Gratis(1): Sales, Inventory, Synchronization, Reports, Management
        gratis.Should().BeEquivalentTo(new[]
        {
            (int)ModuleType.Sales, (int)ModuleType.Inventory,
            (int)ModuleType.Synchronization, (int)ModuleType.Reports,
            (int)ModuleType.Management
        });

        // Pago(2): Gratis + Statistics, WholesaleSales, Expenses, Billing, Histories, Credits
        pago.Should().BeEquivalentTo(new[]
        {
            (int)ModuleType.Sales, (int)ModuleType.Inventory,
            (int)ModuleType.Synchronization, (int)ModuleType.Reports,
            (int)ModuleType.Management, (int)ModuleType.Statistics,
            (int)ModuleType.WholesaleSales, (int)ModuleType.Expenses,
            (int)ModuleType.Billing, (int)ModuleType.Histories,
            (int)ModuleType.Credits
        });

        // Superior(3) and VIP(4): the full AvailableToStore catalog {2..14}
        var fullCatalog = new[]
        {
            (int)ModuleType.Sales, (int)ModuleType.Inventory,
            (int)ModuleType.Synchronization, (int)ModuleType.Reports,
            (int)ModuleType.Statistics, (int)ModuleType.Management,
            (int)ModuleType.WholesaleSales, (int)ModuleType.Expenses,
            (int)ModuleType.Billing, (int)ModuleType.Histories,
            (int)ModuleType.Credits, (int)ModuleType.Warehouses,
            (int)ModuleType.MultiStores
        };
        superior.Should().BeEquivalentTo(fullCatalog);
        vip.Should().BeEquivalentTo(fullCatalog);
    }
}
