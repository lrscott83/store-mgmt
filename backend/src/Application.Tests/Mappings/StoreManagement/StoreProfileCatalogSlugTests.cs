using Application.Dtos.StoreManagement;
using Application.Mappings.StoreManagement;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Stores;
using FluentAssertions;

namespace Application.Tests.Mappings.StoreManagement;

/// <summary>
/// The public catalog slug reaches the super-admin store list through <see cref="StoreDto"/>:
/// the card renders its `/catalog/&lt;slug&gt;` link only when the slug is present. A slug the
/// mapper drops is a silently missing link — the client tests mock the API, so this mapping is
/// the only place the seam can be pinned.
/// </summary>
public class StoreProfileCatalogSlugTests
{
    private static StoreDto MapStoreDto(string? catalogSlug)
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreProfile>());
        var mapper = config.CreateMapper();
        var store = Store.Create(
            "Tienda de prueba", Guid.NewGuid(), true, Guid.NewGuid(), null, storePlanId: (int)StorePlanType.Pago);
        store.CatalogSlug = catalogSlug;
        return mapper.Map<StoreDto>(store);
    }

    [Fact]
    public void Map_StoreDto_ExposesTheCatalogSlugOfAStoreThatSyncedItsCatalog()
    {
        var dto = MapStoreDto("mi-tienda");

        dto.CatalogSlug.Should().Be("mi-tienda");
    }

    [Fact]
    public void Map_StoreDto_ExposesNullCatalogSlugForAStoreWithoutCatalog()
    {
        var dto = MapStoreDto(null);

        dto.CatalogSlug.Should().BeNull();
    }
}
