using Application.Dtos.OnlineOrdering;
using Application.Dtos.WebCatalog;
using FluentAssertions;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// La fila de configuración del catálogo es COMPARTIDA (D19): pedidos, marca y modo de precio viven
/// en ella. La proyección de PEDIDOS, en cambio, expone SOLO columnas de pedidos, y el modo de
/// precio no es una de ellas: es configuración del catálogo, y quien la publica y la gatea es la
/// feature del catálogo (`StoreCatalogBrandingDto`).
///
/// Este contrato no lo vigila ningún compilador: añadir `PriceMode` a `StoreCatalogSettingsDto`
/// compila, se serializa y la vista de pedidos empieza a recibir un dato que no le pertenece. Por
/// eso está fijado aquí.
/// </summary>
public class StoreCatalogSettingsOrderingProjectionTests
{
    private static readonly string[] OrderingColumns =
    {
        nameof(StoreCatalogSettingsDto.Enabled),
        nameof(StoreCatalogSettingsDto.WhatsappNumber),
        nameof(StoreCatalogSettingsDto.PickupEnabled),
        nameof(StoreCatalogSettingsDto.DeliveryEnabled),
        nameof(StoreCatalogSettingsDto.BusinessHours),
        nameof(StoreCatalogSettingsDto.DeliveryZones),
        nameof(StoreCatalogSettingsDto.SyncedAt),
    };

    [Fact]
    public void TheOrderingProjection_ShouldCarryOnlyTheOrderingColumns()
    {
        string[] properties = typeof(StoreCatalogSettingsDto)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();

        properties.Should().BeEquivalentTo(OrderingColumns);
    }

    [Fact]
    public void TheOrderingProjection_ShouldNotExposeThePriceMode()
    {
        typeof(StoreCatalogSettingsDto).GetProperties()
            .Select(property => property.Name)
            .Should()
            .NotContain(nameof(StoreCatalogBrandingDto.PriceMode));
    }

    [Fact]
    public void TheCatalogConfigurationRead_ShouldExposeThePriceMode()
    {
        // La otra mitad del contrato: el modo SÍ viaja, pero por la lectura del catálogo.
        typeof(StoreCatalogBrandingDto).GetProperties()
            .Select(property => property.Name)
            .Should()
            .Contain(nameof(StoreCatalogBrandingDto.PriceMode));
    }
}
