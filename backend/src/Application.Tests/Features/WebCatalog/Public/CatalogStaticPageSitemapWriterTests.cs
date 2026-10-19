using Application.Features.WebCatalog.Public;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T7 de la feature public-catalog-static-pages (S5): el escritor deja sitemap.xml y robots.txt en la
/// RAÍZ del directorio de salida (el mismo OutputRoot que las páginas, el volumen compartido) con la
/// misma disciplina que el escritor de páginas: configuración explícita, reemplazo atómico y UTF-8
/// sin BOM. Corre contra directorios temporales reales.
/// </summary>
public sealed class CatalogStaticPageSitemapWriterTests : IDisposable
{
    private const string BaseUrl = "https://vdt.playground.sceiba.net";

    private readonly string _root;
    private readonly string _outputRoot;

    public CatalogStaticPageSitemapWriterTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "catalog-sitemap-" + Guid.NewGuid().ToString("N"));
        _outputRoot = Path.Combine(_root, "served");
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
    }

    private CatalogStaticPageSitemapWriter CreateWriter(string? outputRoot = null, string? baseUrl = null)
        => new(Options.Create(new CatalogStaticPageOptions
        {
            OutputRoot = outputRoot ?? _outputRoot,
            PublicBaseUrl = baseUrl ?? BaseUrl,
        }));

    private string SitemapPath => Path.Combine(_outputRoot, "sitemap.xml");
    private string RobotsPath => Path.Combine(_outputRoot, "robots.txt");

    [Fact]
    public async Task Write_creates_sitemap_and_robots_at_the_output_root()
    {
        var writer = CreateWriter();

        await writer.WriteAsync(new[] { "mercado-uno", "mercado-dos" });

        var sitemap = await File.ReadAllTextAsync(SitemapPath);
        sitemap.Should().Contain("<loc>https://vdt.playground.sceiba.net/catalog/mercado-uno</loc>");
        sitemap.Should().Contain("<loc>https://vdt.playground.sceiba.net/catalog/mercado-dos</loc>");

        var robots = await File.ReadAllTextAsync(RobotsPath);
        robots.Should().Contain("Sitemap: https://vdt.playground.sceiba.net/sitemap.xml");
    }

    [Fact]
    public async Task Write_publishes_without_utf8_bom()
    {
        var writer = CreateWriter();

        await writer.WriteAsync(new[] { "mercado-uno" });

        var bytes = await File.ReadAllBytesAsync(SitemapPath);
        bytes[0].Should().NotBe(0xEF);
    }

    [Fact]
    public async Task Write_drops_catalogs_that_are_no_longer_published()
    {
        var writer = CreateWriter();
        await writer.WriteAsync(new[] { "mercado-uno", "mercado-dos" });

        await writer.WriteAsync(new[] { "mercado-dos" });

        var sitemap = await File.ReadAllTextAsync(SitemapPath);
        sitemap.Should().Contain("/catalog/mercado-dos");
        sitemap.Should().NotContain("/catalog/mercado-uno");
    }

    [Fact]
    public async Task Write_replaces_the_published_files_instead_of_rewriting_them_in_place()
    {
        var writer = CreateWriter();
        await writer.WriteAsync(new[] { "mercado-uno" });
        var createdAt = File.GetCreationTimeUtc(SitemapPath);

        await Task.Delay(50);
        await writer.WriteAsync(new[] { "mercado-uno", "mercado-dos" });

        // Misma disciplina que la página (corrección R4): publicar reemplaza el archivo con un
        // rename atómico; nunca se reescribe in-place (un fallo a mitad no puede servir a medias).
        File.GetCreationTimeUtc(SitemapPath).Should().BeAfter(createdAt);
        Directory.GetFiles(_outputRoot).Should().BeEquivalentTo(new[] { SitemapPath, RobotsPath });
    }

    [Fact]
    public async Task Write_throws_when_the_output_root_is_not_configured()
    {
        var writer = CreateWriter(outputRoot: "");

        var act = async () => await writer.WriteAsync(new[] { "mercado-uno" });

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task Write_throws_when_the_public_base_url_is_not_configured()
    {
        var writer = CreateWriter(baseUrl: "");

        var act = async () => await writer.WriteAsync(new[] { "mercado-uno" });

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
