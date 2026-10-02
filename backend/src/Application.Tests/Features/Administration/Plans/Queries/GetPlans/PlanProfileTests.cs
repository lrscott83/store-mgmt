using Application.Dtos.Administration.Plans;
using Application.Mappings.Administration;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using FluentAssertions;

namespace Application.Tests.Features.Administration.Plans.Queries.GetPlans;

public class PlanProfileTests
{
    private static PlanDto MapPlan(StorePlan plan)
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<PlanProfile>());
        var mapper = config.CreateMapper();
        return mapper.Map<PlanDto>(plan);
    }

    private static StorePlan CreatePlanWithModules()
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);

        var sales = Module.Create(10, "Ventas", 1, true, 1000, 0, 10, true, true);
        sales.Features.Add(Feature.Create(1, "Ventas rápidas", "Emite ventas en segundos.", 10, 1, true, true));
        var warehouses = Module.Create(11, "Bodegas", 2, false, 2000, 500, 0, true, true);

        var salesInPlan = StorePlanModule.Create(plan.Id, sales.Id);
        salesInPlan.Module = sales;
        var warehousesInPlan = StorePlanModule.Create(plan.Id, warehouses.Id);
        warehousesInPlan.Module = warehouses;
        plan.StorePlanModules.Add(salesInPlan);
        plan.StorePlanModules.Add(warehousesInPlan);

        return plan;
    }

    [Fact]
    public void Map_Plan_ComputesPriceAsSumOfBillableModuleCurrentPrices()
    {
        var dto = MapPlan(CreatePlanWithModules());

        // THE price rule (ModulePriceCalculator): only ACTIVE and NOT price-included modules
        // contribute, each at its effective price.
        //   Ventas  — price-included (gratis) → excluded, its 900 never counts.
        //   Bodegas — billable: 2000 - 500 = 1500.
        // Total = 1500. Previously 2400, because this summed every member module.
        dto.Price.Should().Be(1500f);
    }

    [Fact]
    public void Map_Plan_ExcludesInactiveModuleFromPriceButStillListsIt()
    {
        var plan = StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true);

        var active = Module.Create(10, "Ventas", 1, false, 1000, 0, 0, true, true);
        var inactive = Module.Create(11, "Bodegas", 2, false, 2000, 0, 0, true, isActive: false);

        var activeInPlan = StorePlanModule.Create(plan.Id, active.Id);
        activeInPlan.Module = active;
        var inactiveInPlan = StorePlanModule.Create(plan.Id, inactive.Id);
        inactiveInPlan.Module = inactive;
        plan.StorePlanModules.Add(activeInPlan);
        plan.StorePlanModules.Add(inactiveInPlan);

        var dto = MapPlan(plan);

        // Only the active module contributes (1000); the inactive one is listed but free.
        dto.Price.Should().Be(1000f);
        dto.Modules.Should().HaveCount(2);
        dto.Modules.Single(m => m.Name == "Bodegas").IsActive.Should().BeFalse();
        dto.Modules.Single(m => m.Name == "Ventas").IsActive.Should().BeTrue();
    }

    [Fact]
    public void Map_Plan_MapsPlanTypeFromPlanId()
    {
        var dto = MapPlan(CreatePlanWithModules());

        dto.PlanType.Should().Be("Superior");
        dto.Name.Should().Be("Superior");
        dto.Order.Should().Be(3);
    }

    [Fact]
    public void Map_Plan_MapsModulesWithCurrentPriceDiscountTextAndFeatures()
    {
        var dto = MapPlan(CreatePlanWithModules());

        dto.Modules.Should().HaveCount(2);
        var sales = dto.Modules.Single(m => m.Name == "Ventas");
        sales.ModuleId.Should().Be(10);
        sales.PriceIncluded.Should().BeTrue();
        // Additive field: the catalog flag the price rule reads.
        sales.IsActive.Should().BeTrue();
        sales.CurrentPrice.Should().Be(900f);
        sales.DiscountText.Should().Be("- 10%");
        sales.FeatureDescriptions.Should().Contain("Emite ventas en segundos.");

        var warehouses = dto.Modules.Single(m => m.Name == "Bodegas");
        warehouses.PriceIncluded.Should().BeFalse();
        warehouses.IsActive.Should().BeTrue();
        warehouses.CurrentPrice.Should().Be(1500f);
        warehouses.DiscountText.Should().Be("- $500");
    }

    [Fact]
    public void Map_Plan_OrdersModulesByModuleOrder()
    {
        var dto = MapPlan(CreatePlanWithModules());

        dto.Modules.Select(m => m.Order).Should().BeInAscendingOrder();
    }
}