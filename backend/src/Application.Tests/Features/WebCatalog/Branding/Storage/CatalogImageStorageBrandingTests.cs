using Application.Abstractions.Storage;
using FluentAssertions;
using Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.WebCatalog.Branding.Storage;

/// <summary>
/// La MARCA (F8) no tiene <c>productId</c>: el logo y el banner son de la TIENDA, no de un
/// producto. Por eso el almacenamiento tiene su propia forma de clave,
/// <c>{tenantId}/{storeId}/branding/{kind}/{guid}{ext}</c>, en vez de la de las imágenes de
/// producto.
///
/// Lo que este suite fija, y por qué:
///
///   1. La forma EXACTA de la clave. Es lo único que se persiste en la base, y el endpoint público
///      la resuelve contra <c>BelongsToStore</c>: si la forma cambiara sin querer, el logo dejaría
///      de servirse.
///   2. El `guid` en el nombre. El endpoint público cachea la clave como INMUTABLE un año; si el
///      nombre fuera estable, cambiar el logo serviría la imagen vieja desde la caché.
///   3. Que la clave de marca PASA <c>BelongsToStore</c> y se sirve con el MISMO endpoint que las
///      imágenes de producto: la marca reutiliza el patrón de media en vez de inventar otro, y eso
///      es justo lo que depende de que el prefijo sea <c>{tenant}/{store}/</c>.
///   4. Que el `kind` no puede abrir una carpeta. No viene del cliente —el backend lo pone— pero
///      la clave termina en una ruta, así que se sanea igual que cualquier otra entrada.
/// </summary>
public class CatalogImageStorageBrandingTests : IDisposable
{
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"branding-tests-{Guid.NewGuid():N}");

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
    public async Task SaveBrandingAsync_WithALogo_ShouldBuildTheKeyUnderTheBrandingFolderOfTheStore()
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");

        key.Should().Be($"{_tenantId:N}/{_storeId:N}/branding/logo/{Path.GetFileName(key)}");
        key.Split('/').Should().HaveCount(5);
        key.Split('/')[2].Should().Be("branding");
        key.Split('/')[3].Should().Be("logo");
    }

    /// <summary>
    /// El banner vive en la MISMA carpeta que el logo y se distingue por el `kind`, no por una
    /// carpeta por tipo: una marca son dos imágenes, y dos carpetas para dos archivos sería ruido.
    /// </summary>
    [Fact]
    public async Task SaveBrandingAsync_WithABanner_ShouldShareTheBrandingFolderAndDifferOnlyByKind()
    {
        string logo = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");
        string banner = await Storage().SaveBrandingAsync(Upload("banner.png", "image/png"), _tenantId, _storeId, "banner");

        // Los tres primeros segmentos (tenant, tienda, "branding") son los mismos; el cuarto es el
        // que distingue un archivo del otro.
        banner.Split('/').Take(3).Should().Equal(logo.Split('/').Take(3));
        banner.Split('/')[3].Should().Be("banner");
        banner.Should().NotBe(logo);
    }

    /// <summary>
    /// El `guid` en el nombre es lo que invalida la caché inmutable del endpoint público: dos
    /// subidas del mismo logo producen dos rutas y la segunda nunca se sirve desde la caché de la
    /// primera.
    /// </summary>
    [Fact]
    public async Task SaveBrandingAsync_TwiceWithTheSameFile_ShouldProduceDifferentKeys()
    {
        string first = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");
        string second = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");

        second.Should().NotBe(first);
    }

    /// <summary>
    /// Extensión por el nombre cuando el navegador la manda; el content type es el respaldo. Sin
    /// ninguna de las dos se guarda sin extensión en vez de inventar una.
    /// </summary>
    // Sin extensión en el nombre manda el content type, y una extensión desconocida también cae
    // al content type: no se guarda tal cual.
    [Theory]
    [InlineData("logo.PNG", ".png")]
    [InlineData("logo.jpeg", ".jpeg")]
    [InlineData("sin-extension", ".jpg")]
    [InlineData("raro.bmp", ".jpg")]
    public async Task SaveBrandingAsync_ShouldDeriveTheExtensionFromTheNameOrTheContentType(string fileName, string expected)
    {
        string key = await Storage().SaveBrandingAsync(
            Upload(fileName, "image/jpeg"), _tenantId, _storeId, "logo");

        Path.GetExtension(key).Should().Be(expected);
    }

    /// <summary>
    /// Ni el nombre ni el content type dicen nada: se guarda SIN extensión en vez de inventar una
    /// que no corresponde al contenido. El tipo de la respuesta lo decide entonces el endpoint
    /// público, que cae en `application/octet-stream`.
    /// </summary>
    [Fact]
    public async Task SaveBrandingAsync_WithNoUsableExtension_ShouldSaveItWithoutOne()
    {
        string key = await Storage().SaveBrandingAsync(
            Upload("marca", "application/octet-stream"), _tenantId, _storeId, "logo");

        Path.GetExtension(key).Should().BeEmpty();
    }

    #endregion

    #region The kind cannot open a folder

    /// <summary>
    /// El `kind` no viene del cliente (el backend pone <c>logo</c> o <c>banner</c>), pero la clave
    /// se convierte en ruta y `ResolveFullPath` solo protege contra traversal, no contra una clave
    /// con separadores que esconda un nivel. Saneanarlo aquí deja la forma de la clave con
    /// exactamente cinco segmentos, se ventinga lo que venga.
    /// </summary>
    [Theory]
    [InlineData("../../etc")]
    [InlineData("..\\..\\etc")]
    [InlineData("lo/go")]
    [InlineData("a b")]
    public async Task SaveBrandingAsync_WithSeparatorsInTheKind_ShouldKeepTheKeyWithFiveSegments(string kind)
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, kind);

        key.Split('/').Should().HaveCount(5);
        key.Split('/')[2].Should().Be("branding");
        key.Should().StartWith($"{_tenantId:N}/{_storeId:N}/branding/");
        key.Should().NotContain("..");
        key.Should().NotContain("\\");
    }

    [Fact]
    public async Task SaveBrandingAsync_WithAUsableKindMixedWithSeparators_ShouldNormalizeIt()
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "Lo/go");

        key.Split('/')[3].Should().Be("lo-go");
    }

    /// <summary>
    /// Un `kind` que no deja nada utilizable se RECHAZA en vez de producir una clave sin carpeta:
    /// una ruta ambigua ahí sería imposible de explicar y de depurar.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("///")]
    public async Task SaveBrandingAsync_WithAnUnusableKind_ShouldReject(string kind)
    {
        Func<Task> act = () => Storage().SaveBrandingAsync(
            Upload("logo.png", "image/png"), _tenantId, _storeId, kind);

        await act.Should().ThrowAsync<ArgumentException>();
    }

    #endregion

    #region Written on disk and served by the existing pattern

    [Fact]
    public async Task SaveBrandingAsync_ShouldWriteTheFileUnderTheConfiguredRoot()
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png", 64), _tenantId, _storeId, "logo");

        string expectedPath = Path.Combine(_root, key.Replace('/', Path.DirectorySeparatorChar));
        File.Exists(expectedPath).Should().BeTrue();
        (await File.ReadAllBytesAsync(expectedPath)).Should().HaveCount(64);
    }

    /// <summary>
    /// ESTE es el motivo de no inventar un almacén paralelo: la clave de marca pasa el MISMO
    /// <c>BelongsToStore</c> que las imágenes de producto, así que el endpoint público de media la
    /// sirve sin cambiar una línea.
    /// </summary>
    [Fact]
    public async Task SaveBrandingAsync_ShouldProduceAKeyThatBelongsToTheStore()
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");

        Storage().BelongsToStore(key, _tenantId, _storeId).Should().BeTrue();
    }

    [Fact]
    public async Task SaveBrandingAsync_ShouldProduceAKeyThatDoesNotBelongToAnotherStore()
    {
        string key = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");

        Storage().BelongsToStore(key, _tenantId, Guid.NewGuid()).Should().BeFalse();
        Storage().BelongsToStore(key, Guid.NewGuid(), _storeId).Should().BeFalse();
    }

    /// <summary>Guardar, abrir y borrar funcionan igual que con las imágenes de producto: sin caso nuevo.</summary>
    [Fact]
    public async Task SaveBrandingAsync_ThenOpenAndDelete_ShouldWorkThroughTheSameAbstraction()
    {
        ICatalogImageStorage storage = Storage();
        string key = await storage.SaveBrandingAsync(Upload("logo.webp", "image/webp", 10), _tenantId, _storeId, "logo");

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
    /// La marca no rompe el patrón de producto: las dos formas conviven bajo el mismo prefijo
    /// <c>{tenant}/{store}/</c> y ninguna se pisa con la otra.
    /// </summary>
    [Fact]
    public async Task SaveAsync_ForAProduct_ShouldStillUseTheProductFolderAndNotCollideWithBranding()
    {
        Guid productId = Guid.NewGuid();

        string productKey = await Storage().SaveAsync(
            Upload("camisa.png", "image/png"), _tenantId, _storeId, productId);
        string brandingKey = await Storage().SaveBrandingAsync(Upload("logo.png", "image/png"), _tenantId, _storeId, "logo");

        productKey.Split('/')[2].Should().Be(productId.ToString("N"));
        brandingKey.Split('/')[2].Should().Be("branding");
        productKey.Should().NotBe(brandingKey);
        Storage().BelongsToStore(productKey, _tenantId, _storeId).Should().BeTrue();
    }

    #endregion
}