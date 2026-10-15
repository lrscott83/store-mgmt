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
/// E2E of the PUBLIC plan pricing endpoint (owner request 2026-10-15). The marketing landing has no
/// session, so the read must be anonymous, must expose the REAL prices configured in the DB, and
/// must be limited to Gratis/Pago/Superior with their available-to-store modules.
/// </summary>
[Collection("e2e")]
public sealed class PublicPlanPricingE2ETests
{
    private const string Url = "/api/v1/public/plans";

    private readonly AppTestFactory _f;
    public PublicPlanPricingE2ETests(WebAppFixture fixture) => _f = fixture.Factory;

    private sealed record ModulePricing(int ModuleId, string Name, float BasePrice, float CurrentPrice);

    private sealed record PlanPricing(string PlanType, string Name, int Order, float BasePrice,
        float CurrentPrice, List<ModulePricing> Modules);

    private static async Task<List<PlanPricing>> ReadPublicPlansAsync(HttpClient client)
    {
        var res = await client.GetAsync(Url);
        res.StatusCode.Should().Be(HttpStatusCode.OK, "the landing is a public page");
        return (await res.Content.ReadFromJsonAsync<ApiResponse<List<PlanPricing>>>(ApiResponse.Json))!.Data!;
    }

    // ═══ S1 — anonymous, and only Gratis/Pago/Superior ═══

    [Fact]
    public async Task Anonymous_client_gets_only_the_three_public_plans()
    {
        var plans = await ReadPublicPlansAsync(_f.CreateClient());

        plans.Select(p => p.PlanType).Should().Equal("Gratis", "Pago", "Superior");
        plans.Select(p => p.PlanType).Should().NotContain("VIP",
            "VIP is SuperAdmin-reserved and never published on the landing");
    }

    // ═══ S2 — only active + available-to-store modules ═══

    [Fact]
    public async Task Every_listed_module_is_active_and_available_to_store()
    {
        var plans = await ReadPublicPlansAsync(_f.CreateClient());

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var available = await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.IsActive && m.AvailableToStore
                && m.Features.Any(f => f.IsActive && f.AvailableToStore))
            .Select(m => m.Id).ToListAsync();

        var listed = plans.SelectMany(p => p.Modules).Select(m => m.ModuleId).ToList();
        listed.Should().NotBeEmpty("the catalog must offer modules on the public page");
        foreach (var moduleId in listed)
            available.Should().Contain(moduleId, "an advertised module must be available to stores");

        // The administrative module (1) is not available to stores -> never advertised.
        listed.Should().NotContain(1);
    }

    // ═══ S1 + S4 — cumulative module lists and the single price rule ═══

    [Fact]
    public async Task Plans_are_cumulative_and_their_prices_follow_the_single_rule()
    {
        var plans = await ReadPublicPlansAsync(_f.CreateClient());
        var gratis = plans.Single(p => p.PlanType == "Gratis");
        var pago = plans.Single(p => p.PlanType == "Pago");
        var superior = plans.Single(p => p.PlanType == "Superior");

        // Cumulative: each plan carries the previous plan's modules.
        pago.Modules.Select(m => m.ModuleId).Should().Contain(gratis.Modules.Select(m => m.ModuleId));
        superior.Modules.Select(m => m.ModuleId).Should().Contain(pago.Modules.Select(m => m.ModuleId));

        foreach (var plan in plans)
        {
            // Billable rows are the ones with a non-zero base price; the plan total is the Σ of
            // their EFFECTIVE prices, never above the Σ of their base prices.
            float expected = plan.Modules.Where(m => m.BasePrice > 0).Sum(m => m.CurrentPrice);
            plan.CurrentPrice.Should().BeApproximately(expected, 0.01f);
            plan.BasePrice.Should().BeGreaterThanOrEqualTo(plan.CurrentPrice);
        }
    }

    // ═══ S3 — a price-included (bundled) module is reported at 0 ═══

    [Fact]
    public async Task Included_modules_are_reported_at_zero()
    {
        var plans = await ReadPublicPlansAsync(_f.CreateClient());

        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var includedIds = await db.Set<Module>().IgnoreQueryFilters()
            .Where(m => m.PriceIncluded).Select(m => m.Id).ToListAsync();

        includedIds.Should().NotBeEmpty("precondition: the catalog has bundled modules");
        foreach (var row in plans.SelectMany(p => p.Modules).Where(m => includedIds.Contains(m.ModuleId)))
        {
            row.BasePrice.Should().Be(0f);
            row.CurrentPrice.Should().Be(0f);
        }
    }
}
