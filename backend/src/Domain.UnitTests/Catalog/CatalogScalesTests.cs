using Domain.Common.Catalog;
using FluentAssertions;

namespace Domain.UnitTests.Catalog
{
    /// <summary>
    /// Escalas de los descuentos del catálogo (plan 2026-09-27): el contrato HTTP habla en enteros
    /// escalados con 2 decimales (1250 == 12.50 % y 500 == 5.00).
    /// </summary>
    public class CatalogScalesTests
    {
        [Fact]
        public void Scales_ShouldUseTwoDecimals()
        {
            CatalogScales.PERCENT_SCALE.Should().Be(100);
            CatalogScales.DISCOUNT_PRICE_SCALE.Should().Be(100);
            CatalogScales.MAX_PERCENT_SCALED.Should().Be(10000);
        }

        [Theory]
        [InlineData(0, 0)]
        [InlineData(1250, 12.5)]
        [InlineData(500, 5)]
        [InlineData(10000, 100)]
        public void ToPercent_ShouldConvertScaledIntegerToPercent(int scaled, decimal expected)
        {
            CatalogScales.ToPercent(scaled).Should().Be(expected);
        }

        [Theory]
        [InlineData(0, 0)]
        [InlineData(12.5, 1250)]
        [InlineData(5, 500)]
        [InlineData(100, 10000)]
        [InlineData(12.345, 1235)]
        public void ToScaledPercent_ShouldConvertPercentToScaledInteger(decimal percent, int expected)
        {
            CatalogScales.ToScaledPercent(percent).Should().Be(expected);
        }

        [Theory]
        [InlineData(0, 0)]
        [InlineData(500, 5)]
        [InlineData(12345, 123.45)]
        public void ToDiscountAmount_ShouldConvertScaledIntegerToAmount(int scaled, decimal expected)
        {
            CatalogScales.ToDiscountAmount(scaled).Should().Be(expected);
        }

        [Theory]
        [InlineData(5, 500)]
        [InlineData(123.45, 12345)]
        public void ToScaledDiscountAmount_ShouldConvertAmountToScaledInteger(decimal amount, int expected)
        {
            CatalogScales.ToScaledDiscountAmount(amount).Should().Be(expected);
        }

        [Theory]
        [InlineData(-1, false)]
        [InlineData(0, true)]
        [InlineData(10000, true)]
        [InlineData(10001, false)]
        public void IsValidScaledPercent_ShouldAcceptOnlyZeroToOneHundredPercent(int scaled, bool expected)
        {
            CatalogScales.IsValidScaledPercent(scaled).Should().Be(expected);
        }
    }
}
