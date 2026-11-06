using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Public;
using Domain.Common.Enums;
using Domain.Entities.Products;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// El contrato de precio del catálogo público con modo mayorista.
///
/// Lo que este archivo fija, y por qué importa:
///   * el PRECIO MINORISTA (`Price` / `FinalPrice` / descuentos) no cambia de significado: sigue
///     siendo el precio por unidad, y el descuento del catálogo NO se aplica encima del mayorista
///     (son dos números distintos, no uno derivado del otro);
///   * los tres números del primer escalón (`wholesaleMinPacks`, `wholesaleUnitPrice`,
///     `wholesalePackPrice`) son los del escalón de MENOR `MinPacks`, y la lista de escalones sale
///     ordenada por `MinPacks` ascendente aunque la base los devuelva en otro orden;
///   * `packPrice` es el precio de UN paquete, calculado con la fórmula compartida
///     (`WholesalePricing.LineTotal`), no con una multiplicación escrita aquí.
/// </summary>
public class PublicCatalogProductMapperWholesaleTests
{
    private const string StoreSlug = "mi-tienda";

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    /// <summary>Producto con precio minorista 100 y sin descuento, salvo que el test diga otra cosa.</summary>
    private Product MakeProduct(
        bool wholesaleEnabled = true, int packSize = 12, string? unitLabel = null,
        (int MinPacks, decimal PricePerUnit)[]? tiers = null)
    {
        var product = Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId);
        product.WholesaleEnabled = wholesaleEnabled;
        product.WholesalePackSize = packSize;
        product.WholesaleUnitLabel = unitLabel;

        foreach ((int minPacks, decimal pricePerUnit) in tiers ?? [])
            product.WholesaleTiers.Add(
                ProductWholesaleTier.Create(product.Id, minPacks, pricePerUnit, Currency.CUP, _tenantId));

        return product;
    }

    [Fact]
    public void ToDto_WithTiers_ShouldExposeTheSmallestTierAndEveryTierOrderedByMinPacks()
    {
        // Los escalones se agregan DESORDENADOS a propósito: el contrato es "ascendente", no
        // "como vengan".
        var product = MakeProduct(tiers: [(3, 45m), (1, 50m)], unitLabel: "caja");

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.WholesaleMinPacks.Should().Be(1);
        dto.WholesaleUnitPrice.Should().Be(50m);
        dto.WholesalePackPrice.Should().Be(600m); // 12 unidades × 50
        dto.WholesalePackSize.Should().Be(12);
        dto.WholesaleUnitLabel.Should().Be("caja");

        dto.WholesaleTiers.Should().HaveCount(2);
        dto.WholesaleTiers.Select(tier => tier.MinPacks).Should().Equal(1, 3);
        dto.WholesaleTiers.Select(tier => tier.PricePerUnit).Should().Equal(50m, 45m);
        dto.WholesaleTiers.Select(tier => tier.PackPrice).Should().Equal(600m, 540m);
    }

    /// <summary>
    /// El modo NO reinterpreta el precio minorista: `Price` y `FinalPrice` siguen siendo el precio
    /// por unidad, y el descuento del catálogo no se suma al mayorista.
    /// </summary>
    [Fact]
    public void ToDto_WithWholesaleMode_ShouldKeepTheRetailPriceAndNotApplyTheDiscountToWholesale()
    {
        var product = MakeProduct(tiers: [(1, 50m)]);
        product.PercentDiscountPrice = 1000; // 10 %

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.PriceMode.Should().Be("Wholesale");
        dto.Price.Should().Be(100m);
        dto.FinalPrice.Should().Be(90m);
        dto.HasDiscount.Should().BeTrue();
        dto.PercentDiscount.Should().Be(10m);
        // El mayorista es su propio número: 50, no 45.
        dto.WholesaleUnitPrice.Should().Be(50m);
    }

    /// <summary>
    /// En modo unidad el precio es el de siempre y el DTO NO lleva números mayoristas (hallazgo
    /// R1-001): el catálogo minorista se sirve a anónimos y no puede filtrar la lista al por mayor.
    /// El detalle completo de lo que se retiene vive en
    /// <see cref="PublicCatalogUnitModeDataMinimisationTests"/>.
    /// </summary>
    [Fact]
    public void ToDto_WithUnitMode_ShouldKeepTheRetailFieldsAndLabelTheMode()
    {
        var product = MakeProduct(tiers: [(1, 50m)]);

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Unit);

        dto.PriceMode.Should().Be("Unit");
        dto.Price.Should().Be(100m);
        dto.FinalPrice.Should().Be(100m);
        dto.HasDiscount.Should().BeFalse();
        dto.WholesaleEnabled.Should().BeFalse();
        dto.WholesaleMinPacks.Should().BeNull();
    }

    /// <summary>
    /// Config incompleta = sin config. Los tres casos son los que la puerta del listado acepta como
    /// válidos, uno por uno: sin escalones, sin tamaño de paquete y con escalones pero desactivada.
    /// Publicar sus números sería prometer un precio que el POS no cobra.
    /// </summary>
    [Theory]
    [InlineData(true, 12, 0)]   // sin escalones
    [InlineData(true, 0, 1)]    // sin tamaño de paquete (packPrice no tendría sentido)
    [InlineData(false, 12, 1)]  // escalones presentes pero la venta mayorista está apagada
    public void ToDto_WithoutAValidWholesaleConfig_ShouldNotPublishWholesaleNumbers(
        bool wholesaleEnabled, int packSize, int tiersCount)
    {
        (int, decimal)[] tiers = Enumerable.Range(0, tiersCount).Select(index => (index + 1, 50m)).ToArray();
        var product = MakeProduct(wholesaleEnabled: wholesaleEnabled, packSize: packSize, tiers: tiers);

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.WholesalePackSize.Should().Be(0);
        dto.WholesaleMinPacks.Should().BeNull();
        dto.WholesaleUnitPrice.Should().BeNull();
        dto.WholesalePackPrice.Should().BeNull();
        dto.WholesaleTiers.Should().BeEmpty();
    }

    /// <summary>La unidad la escribe el dueño: si no la escribió, es null y no una cadena vacía que
    /// el frontend tendría que mirar de reojo.</summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ToDto_WithoutAUnitLabel_ShouldPublishNull(string? unitLabel)
    {
        var product = MakeProduct(tiers: [(1, 50m)], unitLabel: unitLabel);

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.WholesaleUnitLabel.Should().BeNull();
    }

    /// <summary>El paquete se redondea a 2 decimales con la MISMA fórmula del total de línea, así
    /// que un precio con centavos no produce dos números distintos según quién multiplique.</summary>
    [Fact]
    public void ToDto_WithACentPrice_ShouldRoundThePackPriceLikeALineTotal()
    {
        var product = MakeProduct(packSize: 3, tiers: [(1, 10.555m)]);

        PublicCatalogProductDto dto = PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.WholesalePackPrice.Should().Be(31.67m); // 3 × 10.555 = 31.665 -> 31.67
        dto.WholesaleTiers.Single().PackPrice.Should().Be(31.67m);
    }
}
