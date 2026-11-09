using System.Reflection;
using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Public;
using Domain.Common.Enums;
using Domain.Entities.Products;
using FluentAssertions;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// R1-001: en modo `Unit` el catálogo público NO publica un solo número mayorista.
///
/// Por qué es un requisito de MINIMIZACIÓN DE DATOS y no de presentación: el catálogo público se
/// sirve a visitantes anónimos, y el manifest JSON viaja completo aunque la tienda no muestre la
/// tarjeta de paquetes. Publicar `wholesaleUnitPrice` / `wholesaleTiers` en modo unidad deja la
/// lista de precios al por mayor al alcance de cualquiera que abra las herramientas del navegador:
/// el catálogo minorista no puede filtrar el mayorista.
///
/// `priceMode` sigue viajando porque es lo que le dice al cliente qué modo está mirando; lo que no
/// viaja es la config del OTRO modo.
///
/// El otro extremo se fija aquí también: en `Wholesale` los números siguen exactamente como estaban,
/// porque un test de "no publica" que pasara por un mapper que nunca publica nada no probaría nada.
/// </summary>
public class PublicCatalogUnitModeDataMinimisationTests
{
    private const string StoreSlug = "mi-tienda";

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();

    private Product MakeProduct()
    {
        var product = Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId);
        product.WholesaleEnabled = true;
        product.WholesalePackSize = 12;
        product.WholesaleUnitLabel = "caja";
        product.WholesaleTiers.Add(
            ProductWholesaleTier.Create(product.Id, 1, 50m, Currency.CUP, _tenantId));
        product.WholesaleTiers.Add(
            ProductWholesaleTier.Create(product.Id, 3, 45m, Currency.CUP, _tenantId));
        return product;
    }

    /// <summary>
    /// El producto SÍ tiene config mayorista válida (lo comprueba el test de abajo con el mismo
    /// objeto), y aun así en modo unidad el DTO sale sin un solo número mayorista.
    /// </summary>
    [Fact]
    public void ToDto_WithUnitMode_ShouldWithholdEveryWholesaleNumber()
    {
        Product product = MakeProduct();

        PublicCatalogProductDto dto =
            PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Unit);

        dto.PriceMode.Should().Be("Unit");

        dto.WholesaleEnabled.Should().BeFalse();
        dto.WholesalePackSize.Should().Be(0);
        dto.WholesaleUnitLabel.Should().BeNull();
        dto.WholesaleMinPacks.Should().BeNull();
        dto.WholesaleUnitPrice.Should().BeNull();
        dto.WholesalePackPrice.Should().BeNull();
        dto.WholesaleTiers.Should().BeEmpty();

        // El precio minorista no se toca: la minimización no puede costar el catálogo.
        dto.Price.Should().Be(100m);
        dto.FinalPrice.Should().Be(100m);
    }

    /// <summary>
    /// Control del mismo producto en modo mayorista: toda la config viaja. Sin este par, el test de
    /// arriba pasaría con un mapper que hubiera dejado de publicar mayorista en TODOS los modos.
    /// </summary>
    [Fact]
    public void ToDto_WithWholesaleMode_ShouldStillPublishEveryWholesaleNumber()
    {
        Product product = MakeProduct();

        PublicCatalogProductDto dto =
            PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Wholesale);

        dto.PriceMode.Should().Be("Wholesale");
        dto.WholesaleEnabled.Should().BeTrue();
        dto.WholesalePackSize.Should().Be(12);
        dto.WholesaleUnitLabel.Should().Be("caja");
        dto.WholesaleMinPacks.Should().Be(1);
        dto.WholesaleUnitPrice.Should().Be(50m);
        dto.WholesalePackPrice.Should().Be(600m);
        dto.WholesaleTiers.Should().HaveCount(2);
    }

    /// <summary>
    /// Modo unidad: ni la unidad de medida configurada ni la lista de escalones se escapan. La
    /// unidad la escribe el dueño para la venta mayorista, así que también es dato mayorista.
    /// </summary>
    [Fact]
    public void ToDto_WithUnitMode_ShouldNotLeakTheUnitLabelOrTheTierList()
    {
        Product product = MakeProduct();

        PublicCatalogProductDto dto =
            PublicCatalogProductMapper.ToDto(product, StoreSlug, CatalogPriceMode.Unit);

        dto.WholesaleUnitLabel.Should().BeNull();
        dto.WholesaleTiers.Should().BeEmpty();
    }

    /// <summary>
    /// R3-default-mode-label: `ToDto` no puede tener un modo por defecto. Con el valor por defecto,
    /// un llamador que no resolvió el modo seguía compilando y estampaba `Unit` en productos cuya
    /// cabecera decía `Wholesale` — el cliente veía el modo de un catálogo y los números del otro.
    /// El compilador no puede probarse desde aquí, así que se fija la firma: tres parámetros, los
    /// tres obligatorios.
    /// </summary>
    [Fact]
    public void ToDto_ShouldNotDefaultThePriceMode()
    {
        MethodInfo method = typeof(PublicCatalogProductMapper).GetMethod(
            nameof(PublicCatalogProductMapper.ToDto),
            BindingFlags.Public | BindingFlags.Static)!;

        ParameterInfo[] parameters = method.GetParameters();

        parameters.Select(parameter => parameter.Name)
            .Should().Equal("product", "storeSlug", "priceMode");
        parameters.Should().OnlyContain(parameter => !parameter.HasDefaultValue,
            "un modo por defecto permite etiquetar el DTO con un modo que nadie resolvió");
    }
}
