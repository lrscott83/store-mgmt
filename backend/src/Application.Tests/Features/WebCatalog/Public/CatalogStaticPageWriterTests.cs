using System.Text;
using Application.Features.WebCatalog.Public;
using FluentAssertions;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T2 de la feature public-catalog-static-pages (S1/S2): el escritor lee el shell del SPA y deja la
/// página servible en <c>catalog/&lt;slug&gt;/index.html</c>. Corre contra directorios temporales reales.
/// </summary>
public sealed class CatalogStaticPageWriterTests : IDisposable
{
    private const string Shell =
        "<!DOCTYPE html><html lang=\"es\"><head><meta charSet=\"utf-8\"/></head>" +
        "<body><div id=\"app\"></div></body></html>";

    private readonly string _root;
    private readonly string _shellPath;
    private readonly string _outputRoot;

    public CatalogStaticPageWriterTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "catalog-static-page-" + Guid.NewGuid().ToString("N"));
        _shellPath = Path.Combine(_root, "index.html");
        _outputRoot = Path.Combine(_root, "served");
        Directory.CreateDirectory(_root);
        File.WriteAllText(_shellPath, Shell, new UTF8Encoding(false));
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
    }

    private CatalogStaticPageWriter CreateWriter(string? shellPath = null, string? outputRoot = null)
        => new(Options.Create(new CatalogStaticPageOptions
        {
            ShellPath = shellPath ?? _shellPath,
            OutputRoot = outputRoot ?? _outputRoot,
        }));

    private static CatalogStaticPageMeta Meta(string title = "Mercado 25 y 28")
        => new(
            Title: title,
            Description: "Mira el catálogo y haz tu pedido por WhatsApp.",
            CanonicalUrl: "https://pos.playground.sceiba.net/catalog/mercado-25-y-28",
            SiteName: title,
            Locale: "es_ES",
            ImageUrl: "https://pos.playground.sceiba.net/media/logo.webp");

    [Fact]
    public async Task Write_creates_the_page_at_catalog_slug_index_html_with_injected_meta()
    {
        var writer = CreateWriter();

        await writer.WriteAsync("mercado-25-y-28", Meta());

        var pagePath = Path.Combine(_outputRoot, "catalog", "mercado-25-y-28", "index.html");
        File.Exists(pagePath).Should().BeTrue();
        var html = await File.ReadAllTextAsync(pagePath);
        html.Should().Contain("<title>Mercado 25 y 28</title>");
        html.Should().Contain("<link rel=\"canonical\" href=\"https://pos.playground.sceiba.net/catalog/mercado-25-y-28\" />");
        html.Should().Contain("<meta property=\"og:image\"");
        html.Should().Contain("<div id=\"app\"></div>");
    }

    [Fact]
    public async Task Write_creates_missing_nested_directories()
    {
        var writer = CreateWriter();

        await writer.WriteAsync("tienda-nueva", Meta("Tienda Nueva"));

        Directory.Exists(Path.Combine(_outputRoot, "catalog", "tienda-nueva")).Should().BeTrue();
    }

    [Fact]
    public async Task Write_overwrites_a_previous_page()
    {
        var writer = CreateWriter();
        await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Viejo"));

        await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Nuevo"));

        var html = await File.ReadAllTextAsync(
            Path.Combine(_outputRoot, "catalog", "mercado-25-y-28", "index.html"));
        html.Should().Contain("<title>Nombre Nuevo</title>");
        html.Should().NotContain("Nombre Viejo");
    }

    [Fact]
    public async Task Write_replaces_the_served_page_instead_of_rewriting_it_in_place()
    {
        var writer = CreateWriter();
        await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Viejo"));

        var pagePath = Path.Combine(_outputRoot, "catalog", "mercado-25-y-28", "index.html");
        var createdAt = File.GetCreationTimeUtc(pagePath);

        await Task.Delay(50);
        await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Nuevo"));

        // Corrección R4: la publicación reemplaza el archivo servible con un rename atómico; nunca lo
        // trunca ni lo reescribe in-place. Un archivo reemplazado es un objeto nuevo (conserva el
        // creation time del temporal); una reescritura in-place conservaría el creation time original
        // — y su ventana trunca-y-escribe es la que podía servir un HTML a medias.
        File.GetCreationTimeUtc(pagePath).Should().BeAfter(createdAt);

        var html = await File.ReadAllTextAsync(pagePath);
        html.Should().Contain("<title>Nombre Nuevo</title>");
        html.Should().NotContain("Nombre Viejo");
        Directory.GetFiles(Path.GetDirectoryName(pagePath)!)
            .Should().BeEquivalentTo(new[] { pagePath });
    }

    [Fact]
    public async Task A_blocked_publish_never_serves_a_partial_page_nor_leaves_residue()
    {
        var writer = CreateWriter();
        await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Viejo"));

        var pagePath = Path.Combine(_outputRoot, "catalog", "mercado-25-y-28", "index.html");
        var before = await File.ReadAllTextAsync(pagePath);

        // Un lector bloquea el reemplazo (el sistema de archivos puede denegar el rename sobre un
        // archivo abierto): la publicación puede fallar, pero la ruta servible debe quedar intacta,
        // nunca a medias y sin temporales de por medio.
        using (new FileStream(pagePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            try { await writer.WriteAsync("mercado-25-y-28", Meta("Nombre Nuevo")); }
            catch (IOException) { /* bloqueo del sistema de archivos: el fallo es la ruta ejercitada */ }
            catch (UnauthorizedAccessException) { /* idem: el SO deniega el reemplazo */ }
        }

        var after = await File.ReadAllTextAsync(pagePath);
        after.Should().EndWith("</html>");
        (after == before || after.Contains("<title>Nombre Nuevo</title>"))
            .Should().BeTrue("la ruta servible queda como la página anterior completa o la nueva completa");
        Directory.GetFiles(Path.GetDirectoryName(pagePath)!)
            .Should().BeEquivalentTo(new[] { pagePath });
    }

    [Theory]
    [InlineData("../escape")]
    [InlineData("a/b")]
    [InlineData("MAYUS")]
    [InlineData("con espacio")]
    [InlineData("")]
    public async Task Write_rejects_unsafe_slugs(string slug)
    {
        var writer = CreateWriter();

        var act = async () => await writer.WriteAsync(slug, Meta());

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task Write_throws_when_the_shell_does_not_exist()
    {
        var writer = CreateWriter(shellPath: Path.Combine(_root, "missing.html"));

        var act = async () => await writer.WriteAsync("mercado-25-y-28", Meta());

        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task Write_throws_when_the_shell_path_is_not_configured()
    {
        var writer = CreateWriter(shellPath: "");

        var act = async () => await writer.WriteAsync("mercado-25-y-28", Meta());

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task Write_throws_when_the_output_root_is_not_configured()
    {
        var writer = CreateWriter(outputRoot: "");

        var act = async () => await writer.WriteAsync("mercado-25-y-28", Meta());

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
