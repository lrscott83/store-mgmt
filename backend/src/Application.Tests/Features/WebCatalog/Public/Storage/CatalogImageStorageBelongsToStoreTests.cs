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
    /// El prefijo ES el correcto, pero el segmento cambia el destino al normalizar la ruta. Además de
    /// `.`/`..` exactos, Windows recorta espacios/puntos finales (`.. ` y `...` colapsan a `..`), así
    /// que esos también se rechazan: aceptarlos equivaldría a leer la imagen de otra tienda.
    /// </summary>
    [Theory]
    [InlineData("..")]
    [InlineData(".")]
    [InlineData(".. ")]
    [InlineData("...")]
    [InlineData(". ")]
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

    /// <summary>
    /// La resolución de ruta rechaza el traversal por sí misma, para CUALQUIER clave (no solo la que
    /// pasa por `BelongsToStore`): un `..` no puede escapar de la raíz del catálogo.
    /// </summary>
    [Theory]
    [InlineData("../escape.png")]
    [InlineData("..\\escape.png")]
    public async Task OpenAsync_WithATraversalKey_ShouldThrow(string key)
    {
        string root = Path.Combine(Path.GetTempPath(), "cat-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var storage = new CatalogImageStorage(Options.Create(new CatalogImageStorageOptions { CatalogImageRoot = root }));

        try
        {
            Func<Task> act = () => storage.OpenAsync(key);

            await act.Should().ThrowAsync<InvalidOperationException>();
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
