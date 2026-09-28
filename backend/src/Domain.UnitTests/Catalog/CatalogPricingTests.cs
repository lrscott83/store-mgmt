using Domain.Common.Catalog;
using FluentAssertions;

namespace Domain.UnitTests.Catalog
{
    /// <summary>
    /// Fórmula del precio final del catálogo web (decisión D7, plan 2026-09-27): el porcentaje y el
    /// monto rebajado se combinan (primero el %, después el monto) y el resultado nunca baja de 0.
    /// </summary>
    public class CatalogPricingTests
    {
        [Fact]
        public void FinalPrice_ShouldReturnPriceUnchanged_WhenThereIsNoDiscount()
        {
            CatalogPricing.FinalPrice(100m, 0, 0).Should().Be(100m);
        }

        [Fact]
        public void FinalPrice_ShouldApplyPercentOnly()
        {
            // 12.50 % de 100 = 12.50 -> 87.50
            CatalogPricing.FinalPrice(100m, 1250, 0).Should().Be(87.5m);
        }

        [Fact]
        public void FinalPrice_ShouldSubtractAmountOnly()
        {
            CatalogPricing.FinalPrice(100m, 0, 500).Should().Be(95m);
        }

        [Fact]
        public void FinalPrice_ShouldCombinePercentAndAmount_WhenBothAreSet()
        {
            // 100 - 12.50 = 87.50 -> 87.50 - 5.00 = 82.50
            CatalogPricing.FinalPrice(100m, 1250, 500).Should().Be(82.5m);
        }

        [Fact]
        public void FinalPrice_ShouldRoundToTwoDecimals_WhenPercentLeavesFractions()
        {
            // 9.99 * 0.875 = 8.74125 -> 8.74
            CatalogPricing.FinalPrice(9.99m, 1250, 0).Should().Be(8.74m);
        }

        [Fact]
        public void FinalPrice_ShouldRoundPercentThousands_WithAwayFromZero()
        {
            // 100 - 1 % = 99 - 5.00 = 94.00
            CatalogPricing.FinalPrice(100m, 100, 500).Should().Be(94m);
        }

        [Fact]
        public void FinalPrice_ShouldNeverBeNegative()
        {
            CatalogPricing.FinalPrice(10m, 0, 5000).Should().Be(0m);
            CatalogPricing.FinalPrice(10m, 10000, 5000).Should().Be(0m);
        }

        [Fact]
        public void FinalPrice_ShouldBeZero_WhenPercentIsFull()
        {
            CatalogPricing.FinalPrice(123.45m, CatalogScales.MAX_PERCENT_SCALED, 0).Should().Be(0m);
        }

        [Theory]
        [InlineData(0, 0, false)]
        [InlineData(1250, 0, true)]
        [InlineData(0, 500, true)]
        [InlineData(1250, 500, true)]
        public void HasDiscount_ShouldReportWhetherAnyDiscountIsConfigured(int percent, int amount, bool expected)
        {
            CatalogPricing.HasDiscount(percent, amount).Should().Be(expected);
        }
    }
}
