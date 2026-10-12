using FluentAssertions;
using Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.WebCatalog.Public.Storage;

/// <summary>
/// Pertenencia de una clave de imagen a la tienda del slug. Es la puerta del endpoint de media
/// ANÓNIMO: si acepta una clave con un segmento `..`, la lectura se resuelve en OTRA tienda
/// (traversal cross-store, sin sesión). La decisión tiene que tomarse sobre la MISMA forma en la que
/// luego se resuelve la ruta, no sobre el texto crudo.
/// </summary>
public class CatalogImageStorageBelongsToStoreTests
{
    private static readonly Guid Tenant = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Store = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static CatalogImageStorage Storage()
        => new(Options.Create(new CatalogImageStorageOptions { CatalogImageRoot = "storage/catalog" }));

    private static string N(Guid id) => id.ToString("N");

    [Fact]
    public void BelongsToStore_WithOwnKey_ShouldBeTrue()
        => Storage().BelongsToStore($"{N(Tenant)}/{N(Store)}/catalog/carousel/a.png", Tenant, Store)
            .Should().BeTrue();

    [Fact]
    public void BelongsToStore_WithBackslashes_ShouldStillBeTrue()
        => Storage().BelongsToStore($"{N(Tenant)}\\{N(Store)}\\catalog\\carousel\\a.png", Tenant, Store)
            .Should().BeTrue();

    [Fact]
    public void BelongsToStore_WithAnotherStore_ShouldBeFalse()
        => Storage().BelongsToStore($"{N(Tenant)}/{N(Guid.NewGuid())}/catalog/carousel/a.png", Tenant, Store)
            .Should().BeFalse();

    /// <summary>
    /// El prefijo ES el correcto, pero el segmento `.`/`..` cambia el destino al normalizar la ruta.
    /// Aceptar esto equivaldría a leer la imagen de otra tienda: la clave NO pertenece aunque empiece
    /// por el prefijo esperado.
    /// </summary>
    [Theory]
    [InlineData("..")]
    [InlineData(".")]
    public void BelongsToStore_WithATraversalSegment_ShouldBeFalse(string segment)
    {
        string key = $"{N(Tenant)}/{N(Store)}/{segment}/{N(Guid.NewGuid())}/{N(Guid.NewGuid())}/x.png";

        Storage().BelongsToStore(key, Tenant, Store).Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("otra/ruta.png")]
    public void BelongsToStore_WithAKeyWithoutThePrefix_ShouldBeFalse(string key)
        => Storage().BelongsToStore(key, Tenant, Store).Should().BeFalse();
}
