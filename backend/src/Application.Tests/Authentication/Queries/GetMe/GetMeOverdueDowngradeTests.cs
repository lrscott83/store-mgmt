using Application.Features.Authentication.Queries.GetMe;
using Domain.Common.Utils;
using Domain.Entities.Billing;
using Domain.Entities.Modules;
using FluentAssertions;

namespace Application.Tests.Authentication.Queries.GetMe;

public class GetMeOverdueDowngradeTests
{
    private static Module FreeModule(int id = 1) =>
        Module.Create(id, "FreeModule", 1, priceIncluded: true, 0, availableToStore: true, isActive: true);

    private static Module PaidModule(int id = 2) =>
        Module.Create(id, "PaidModule", 2, priceIncluded: false, 2000, discountPrice: 0, percentDiscountPrice: 0,
            availableToStore: true, isActive: true);

    [Fact]
    public void FilterForBilling_overdue_keepsOnlyPriceIncluded()
    {
        // Arrange
        var modules = new[] { FreeModule(1), PaidModule(2), FreeModule(3) };
        var billing = new StoreBillingSummary
        {
            StoreId = Guid.NewGuid(),
            PlanType = "Paid",
            Status = StoreBillingStatusType.Vencido,
            PaymentStartDate = new DateOnly(2026, 1, 1),
            NextDueDate = new DateOnly(2026, 3, 10),
        };

        // Act
        var result = GetMeQueryHandler.FilterForBilling(modules, billing);

        // Assert
        result.Should().BeEquivalentTo(new List<int> { 1, 3 });
    }

    [Fact]
    public void FilterForBilling_activePaid_returnsAllModules()
    {
        // Arrange
        var modules = new[] { FreeModule(1), PaidModule(2) };
        var billing = new StoreBillingSummary
        {
            StoreId = Guid.NewGuid(),
            PlanType = "Paid",
            Status = StoreBillingStatusType.AlDia,
            PaymentStartDate = new DateOnly(2026, 1, 1),
            NextDueDate = new DateOnly(2026, 3, 10),
        };

        // Act
        var result = GetMeQueryHandler.FilterForBilling(modules, billing);

        // Assert
        result.Should().BeEquivalentTo(new List<int> { 1, 2 });
    }

    [Fact]
    public void FilterForBilling_inGrace_returnsAllModules()
    {
        // Arrange
        var modules = new[] { FreeModule(1), PaidModule(2) };
        var billing = new StoreBillingSummary
        {
            StoreId = Guid.NewGuid(),
            PlanType = "Paid",
            Status = StoreBillingStatusType.EnGracia,
            PaymentStartDate = new DateOnly(2026, 1, 1),
            NextDueDate = new DateOnly(2026, 3, 10),
        };

        // Act
        var result = GetMeQueryHandler.FilterForBilling(modules, billing);

        // Assert
        result.Should().BeEquivalentTo(new List<int> { 1, 2 });
    }

    [Fact]
    public void FilterForBilling_freePlan_returnsAllModules()
    {
        // Arrange
        var modules = new[] { FreeModule(1), PaidModule(2) };
        var billing = new StoreBillingSummary
        {
            StoreId = Guid.NewGuid(),
            PlanType = "Free",
            Status = StoreBillingStatusType.NoAplica,
            PaymentStartDate = null,
            NextDueDate = DateOnly.MaxValue,
        };

        // Act
        var result = GetMeQueryHandler.FilterForBilling(modules, billing);

        // Assert
        result.Should().BeEquivalentTo(new List<int> { 1, 2 });
    }

    [Fact]
    public void FilterForBilling_porVencer_returnsAllModules()
    {
        // Arrange
        var modules = new[] { FreeModule(1), PaidModule(2) };
        var billing = new StoreBillingSummary
        {
            StoreId = Guid.NewGuid(),
            PlanType = "Paid",
            Status = StoreBillingStatusType.PorVencer,
            PaymentStartDate = new DateOnly(2026, 1, 1),
            NextDueDate = new DateOnly(2026, 3, 10),
        };

        // Act
        var result = GetMeQueryHandler.FilterForBilling(modules, billing);

        // Assert
        result.Should().BeEquivalentTo(new List<int> { 1, 2 });
    }
}
