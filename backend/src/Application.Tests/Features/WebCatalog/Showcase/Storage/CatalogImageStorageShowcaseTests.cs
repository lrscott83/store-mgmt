using Application.Abstractions.Storage;
using Application.Features.WebCatalog.Showcase;
using FluentAssertions;
using Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.WebCatalog.Showcase.Storage;

/// <summary>
/// Las imágenes del SHOWCASE (carrusel e imágenes del día) tampoco tienen <c>productId</c>: el archivo
/// pertenece a la TIENDA. Por eso el almacenamiento tiene su propia forma de clave,
/// <c>{tenantId}/{storeId}/catalog/{kind}/{guid}{ext}</c>, en vez de la de las imágenes de producto.
///
/// Lo que este suite fija, y por qué:
///
///   1. La forma EXACTA de la clave. Es lo único que se persiste en la base, y el endpoint público la
///      resuelve contra <c>BelongsToStore</c>: si la forma cambiara sin querer, el carrusel dejaría de
///      servirse.
///   2. Que el `kind` es UN SEGMENTO de carpeta y distingue los dos conjuntos: "carousel" y "daily"
///      son imágenes distintas, no la misma imagen con otro rótulo.
///   3. Que la clave del showcase PASA <c>BelongsToStore</c> y la sirve el MISMO endpoint público que
///      las imágenes de producto y las de marca. Ese es el motivo de no inventar un almacén paralelo.
///   4. Que el `kind` no puede abrir una carpeta. No viene del cliente —el backend lo pone— pero la
///      clave termina en una ruta, así que se sanea igual que cualquier otra entrada.
///   5. Que NO se pisa con las otras dos formas de clave que ya conviven bajo el mismo prefijo
///      <c>{tenant}/{store}/</c>.
/// </summary>
public class CatalogImageStorageShowcaseTests : IDisposable
{
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"showcase-tests-{Guid.NewGuid():N}");

    private CatalogImageStorage Storage() => new(Options.Create(new CatalogImageStorageOptions
    {
        CatalogImageRoot = _root,
    }));

    private static CatalogImageUpload Upload(string fileName, string contentType, int length = 32)
        => new(new MemoryStream(new byte[length]), fileName, contentType, length);

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);

        GC.SuppressFinalize(this);
    }

    #region Key shape

    [Fact]
    public async Task SaveCatalogImageAsync_WithACarouselImage_ShouldBuildTheKeyUnderTheCatalogFolderOfTheStore()
    {
        string key = await Storage().SaveCatalogImageAsync(
            Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        key.Should().Be($"{_tenantId:N}/{_storeId:N}/catalog/carousel/{Path.GetFileName(key)}");
        key.Split('/').Should().HaveCount(5);
        key.Split('/')[2].Should().Be("catalog");
        key.Split('/')[3].Should().Be("carousel");
    }

    /// <summary>
    /// Los dos conjuntos comparten la carpeta <c>catalog</c> y se distinguen por el <c>kind</c>, igual
    /// que el logo y el banner comparten <c>branding</c>. Dos carpetas para dos imágenes del mismo
    /// bloque sería ruido, y el conjunto es lo que la fila ya guarda.
    /// </summary>
    [Fact]
    public async Task SaveCatalogImageAsync_WithADailyImage_ShouldShareTheCatalogFolderAndDifferOnlyByKind()
    {
        string carousel = await Storage().SaveCatalogImageAsync(
            Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);
        string daily = await Storage().SaveCatalogImageAsync(
            Upload("destacado.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Daily);

        daily.Split('/').Take(3).Should().Equal(carousel.Split('/').Take(3));
        daily.Split('/')[3].Should().Be("daily");
        daily.Should().NotBe(carousel);
    }

    /// <summary>
    /// El `guid` en el nombre es lo que invalida la caché inmutable del endpoint público: dos subidas
    /// del MISMO archivo producen dos rutas, así que la segunda nunca se sirve desde la caché de la
    /// primera. Sin esto, cambiar el carrusel no se vería hasta que expirara el caché.
    /// </summary>
    [Fact]
    public async Task SaveCatalogImageAsync_TwiceWithTheSameFile_ShouldProduceDifferentKeys()
    {
        string first = await Storage().SaveCatalogImageAsync(
            Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);
        string second = await Storage().SaveCatalogImageAsync(
            Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        second.Should().NotBe(first);
    }

    /// <summary>
    /// Extensión por el nombre cuando el navegador la manda; el content type es el respaldo. Sin
    /// ninguna de las dos se guarda sin extensión en vez de inventar una.
    /// </summary>
    [Theory]
    [InlineData("carrusel.PNG", ".png")]
    [InlineData("carrusel.jpeg", ".jpeg")]
    [InlineData("sin-extension", ".jpg")]
    [InlineData("raro.bmp", ".jpg")]
    public async Task SaveCatalogImageAsync_ShouldDeriveTheExtensionFromTheNameOrTheContentType(string fileName, string expected)
    {
        string key = await Storage().SaveCatalogImageAsync(
            Upload(fileName, "image/jpeg"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        Path.GetExtension(key).Should().Be(expected);
    }

    /// <summary>
    /// Ni el nombre ni el content type dicen nada: se guarda SIN extensión en vez de inventar una que
    /// no corresponde al contenido. El tipo de la respuesta lo decide entonces el endpoint público,
    /// que cae en <c>application/octet-stream</c>.
    /// </summary>
    [Fact]
    public async Task SaveCatalogImageAsync_WithNoUsableExtension_ShouldSaveItWithoutOne()
    {
        string key = await Storage().SaveCatalogImageAsync(
            Upload("destacado", "application/octet-stream"), _tenantId, _storeId, ShowcaseImageKinds.Daily);

        Path.GetExtension(key).Should().BeEmpty();
    }

    #endregion

    #region The kind cannot open a folder

    /// <summary>
    /// El <c>kind</c> no viene del cliente (el backend pone <c>carousel</c> o <c>daily</c>), pero la
    /// clave se convierte en ruta y <c>ResolveFullPath</c> solo protege contra traversal, no contra
    /// una clave con separadores que esconda un nivel. Saneanarlo aquí deja la forma de la clave con
    /// exactamente cinco segmentos, se ventinga lo que venga.
    /// </summary>
    [Theory]
    [InlineData("../../etc")]
    [InlineData("..\\..\\etc")]
    [InlineData("car/ousel")]
    [InlineData("a b")]
    public async Task SaveCatalogImageAsync_WithSeparatorsInTheKind_ShouldKeepTheKeyWithFiveSegments(string kind)
    {
        string key = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png"), _tenantId, _storeId, kind);

        key.Split('/').Should().HaveCount(5);
        key.Split('/')[2].Should().Be("catalog");
        key.Should().StartWith($"{_tenantId:N}/{_storeId:N}/catalog/");
        key.Should().NotContain("..");
        key.Should().NotContain("\\");
    }

    [Fact]
    public async Task SaveCatalogImageAsync_WithAUsableKindMixedWithSeparators_ShouldNormalizeIt()
    {
        string key = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png"), _tenantId, _storeId, "Car/rusel");

        key.Split('/')[3].Should().Be("car-rusel");
    }

    /// <summary>
    /// Un <c>kind</c> que no deja nada utilizable se RECHAZA en vez de producir una clave sin carpeta:
    /// una ruta ambigua ahí sería imposible de explicar y de depurar.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("///")]
    public async Task SaveCatalogImageAsync_WithAnUnusableKind_ShouldReject(string kind)
    {
        Func<Task> act = () => Storage().SaveCatalogImageAsync(
            Upload("carrusel.png", "image/png"), _tenantId, _storeId, kind);

        await act.Should().ThrowAsync<ArgumentException>();
    }

    #endregion

    #region Written on disk and served by the existing pattern

    [Fact]
    public async Task SaveCatalogImageAsync_ShouldWriteTheFileUnderTheConfiguredRoot()
    {
        string key = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png", 64), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        string expectedPath = Path.Combine(_root, key.Replace('/', Path.DirectorySeparatorChar));
        File.Exists(expectedPath).Should().BeTrue();
        (await File.ReadAllBytesAsync(expectedPath)).Should().HaveCount(64);
    }

    /// <summary>
    /// ESTE es el motivo de no inventar un almacén paralelo: la clave del showcase pasa el MISMO
    /// <c>BelongsToStore</c> que las imágenes de producto y las de marca, así que el endpoint público
    /// de media la sirve sin cambiar una línea.
    /// </summary>
    [Fact]
    public async Task SaveCatalogImageAsync_ShouldProduceAKeyThatBelongsToTheStore()
    {
        string key = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        Storage().BelongsToStore(key, _tenantId, _storeId).Should().BeTrue();
    }

    [Fact]
    public async Task SaveCatalogImageAsync_ShouldProduceAKeyThatDoesNotBelongToAnotherStore()
    {
        string key = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        Storage().BelongsToStore(key, _tenantId, Guid.NewGuid()).Should().BeFalse();
        Storage().BelongsToStore(key, Guid.NewGuid(), _storeId).Should().BeFalse();
    }

    /// <summary>Guardar, abrir y borrar funcionan igual que con las demás: sin caso nuevo.</summary>
    [Fact]
    public async Task SaveCatalogImageAsync_ThenOpenAndDelete_ShouldWorkThroughTheSameAbstraction()
    {
        ICatalogImageStorage storage = Storage();
        string key = await storage.SaveCatalogImageAsync(Upload("destacado.webp", "image/webp", 10), _tenantId, _storeId, ShowcaseImageKinds.Daily);

        CatalogStoredImage? opened = await storage.OpenAsync(key);
        opened.Should().NotBeNull();
        opened!.ContentType.Should().Be("image/webp");
        opened.Length.Should().Be(10);

        // El stream se cierra antes de borrar: es un FileStream sobre el archivo que se va a
        // eliminar, y el endpoint público lo abre de la misma forma.
        await opened.Content.DisposeAsync();

        await storage.DeleteAsync(key);
        (await storage.OpenAsync(key)).Should().BeNull();
    }

    /// <summary>
    /// El showcase no rompe el patrón: las TRES formas conviven bajo el mismo prefijo
    /// <c>{tenant}/{store}/</c> y ninguna se pisa con la otra.
    /// </summary>
    [Fact]
    public async Task SaveCatalogImageAsync_ShouldNotCollideWithTheProductOrBrandingKeys()
    {
        Guid productId = Guid.NewGuid();

        string productKey = await Storage().SaveAsync(Upload("camisa.png", "image/png"), _tenantId, _storeId, productId);
        string brandingKey = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");
        string showcaseKey = await Storage().SaveCatalogImageAsync(Upload("carrusel.png", "image/png"), _tenantId, _storeId, ShowcaseImageKinds.Carousel);

        productKey.Split('/')[2].Should().Be(productId.ToString("N"));
        brandingKey.Split('/')[2].Should().Be("branding");
        showcaseKey.Split('/')[2].Should().Be("catalog");
        new[] { productKey, brandingKey, showcaseKey }.Should().OnlyHaveUniqueItems();

        ICatalogImageStorage storage = Storage();
        storage.BelongsToStore(productKey, _tenantId, _storeId).Should().BeTrue();
        storage.BelongsToStore(brandingKey, _tenantId, _storeId).Should().BeTrue();
        storage.BelongsToStore(showcaseKey, _tenantId, _storeId).Should().BeTrue();
    }

    #endregion
}