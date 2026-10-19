using System.Text;
using Application.Features.WebCatalog.Public;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace Application.Tests.Features.WebCatalog.Public;

/// <summary>
/// T6 de la feature public-catalog-static-pages (S3/S9): la pasada completa enumera los catálogos
/// PUBLICADOS y regenera la página de cada uno. Es la que corre al arrancar la API (backfill de los
/// catálogos existentes) y cada vez que cambia el shell del SPA (cada deploy del frontend, porque el
/// shell referencia assets hasheados del build nuevo). Best-effort por catálogo: uno que falle no
/// detiene a los demás, y donde la feature no está configurada se calla.
/// T7 (S5): la misma pasada actualiza el índice de descubrimiento —sitemap.xml + robots.txt— con los
/// catálogos que resuelven como públicos, y un fallo del índice no tumba la pasada.
/// </summary>
public sealed class CatalogStaticPageSynchronizerTests : IDisposable
{
    private const string Shell =
        "<!DOCTYPE html><html lang=\"es\"><head><meta charSet=\"utf-8\"/></head>" +
        "<body><div id=\"app\"></div></body></html>";

    private readonly string _root;
    private readonly string _shellPath;
    private readonly Mock<IStoreRepository> _storeRepository = new();
    private readonly Mock<ICatalogStaticPageGenerator> _generator = new();
    private readonly Mock<ICatalogStaticPageSitemapWriter> _sitemapWriter = new();

    public CatalogStaticPageSynchronizerTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "catalog-static-page-sync-" + Guid.NewGuid().ToString("N"));
        _shellPath = Path.Combine(_root, "shell", "index.html");
        Directory.CreateDirectory(Path.Combine(_root, "shell"));
        File.WriteAllText(_shellPath, Shell, new UTF8Encoding(false));
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { /* best effort cleanup */ }
    }

    private CatalogStaticPageSynchronizer CreateSynchronizer(string? shellPath = null, string? outputRoot = null)
        => new(
            _storeRepository.Object,
            _generator.Object,
            _sitemapWriter.Object,
            Options.Create(new CatalogStaticPageOptions
            {
                ShellPath = shellPath ?? _shellPath,
                OutputRoot = outputRoot ?? Path.Combine(_root, "served"),
            }),
            NullLogger<CatalogStaticPageSynchronizer>.Instance);

    private Store ArrangePublishedCatalog(string slug)
    {
        var store = Store.Create($"Tienda {slug}", Guid.NewGuid(), approved: true, Guid.NewGuid(), address: null, description: null);
        store.CatalogSlug = slug;
        _storeRepository.Setup(r => r.GetStoreByCatalogSlugAsync(slug)).ReturnsAsync(store);
        return store;
    }

    [Fact]
    public async Task Regenerate_all_skips_everything_when_the_feature_is_not_configured()
    {
        var synchronizer = CreateSynchronizer(outputRoot: "");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno" });

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(0, 0, 0));
        _storeRepository.Verify(r => r.GetCatalogSlugsAsync(), Times.Never);
        _generator.Verify(
            g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _sitemapWriter.Verify(
            w => w.WriteAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Regenerate_all_skips_when_the_shell_is_not_published_yet()
    {
        var synchronizer = CreateSynchronizer(shellPath: Path.Combine(_root, "missing", "index.html"));
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno" });

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(0, 0, 0));
        _storeRepository.Verify(r => r.GetCatalogSlugsAsync(), Times.Never);
        _generator.Verify(
            g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _sitemapWriter.Verify(
            w => w.WriteAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Regenerate_all_generates_the_page_of_every_published_catalog()
    {
        var synchronizer = CreateSynchronizer();
        var uno = ArrangePublishedCatalog("mercado-uno");
        var dos = ArrangePublishedCatalog("mercado-dos");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno", "mercado-dos" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(2, 2, 0));
        _generator.Verify(g => g.GenerateAsync(uno.Id, It.IsAny<CancellationToken>()), Times.Once);
        _generator.Verify(g => g.GenerateAsync(dos.Id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Regenerate_all_skips_a_slug_that_is_no_longer_public()
    {
        var synchronizer = CreateSynchronizer();
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "fantasma" });
        _storeRepository
            .Setup(r => r.GetStoreByCatalogSlugAsync("fantasma"))
            .ReturnsAsync((Store?)null);

        var result = await synchronizer.RegenerateAllAsync();

        // Candidato contado, no escrito y NO fallido: un catálogo que dejó de ser público no es un error.
        result.Should().Be(new CatalogStaticPageSyncResult(1, 0, 0));
        _generator.Verify(
            g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Regenerate_all_leaves_a_catalog_that_is_no_longer_public_out_of_the_index()
    {
        var synchronizer = CreateSynchronizer();
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "fantasma" });
        _storeRepository
            .Setup(r => r.GetStoreByCatalogSlugAsync("fantasma"))
            .ReturnsAsync((Store?)null);

        await synchronizer.RegenerateAllAsync();

        // El sitemap lista SOLO los catálogos que resuelven como públicos: un slug cuya tienda (o su
        // dueño) ya no está activo queda fuera aunque la columna del slug siga puesta.
        _sitemapWriter.Verify(
            w => w.WriteAsync(
                It.Is<IReadOnlyCollection<string>>(slugs => slugs.Count == 0),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Regenerate_all_keeps_going_when_one_catalog_fails()
    {
        var synchronizer = CreateSynchronizer();
        var roto = ArrangePublishedCatalog("roto");
        var sano = ArrangePublishedCatalog("sano");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "roto", "sano" });
        _generator
            .Setup(g => g.GenerateAsync(roto.Id, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("disco lleno"));
        _generator
            .Setup(g => g.GenerateAsync(sano.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(2, 1, 1));
    }

    [Fact]
    public async Task Regenerate_all_keeps_a_catalog_with_a_failed_page_in_the_index()
    {
        var synchronizer = CreateSynchronizer();
        var roto = ArrangePublishedCatalog("roto");
        var sano = ArrangePublishedCatalog("sano");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "roto", "sano" });
        _generator
            .Setup(g => g.GenerateAsync(roto.Id, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("disco lleno"));
        _generator
            .Setup(g => g.GenerateAsync(sano.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        await synchronizer.RegenerateAllAsync();

        // Resolver la tienda ya publica el slug: que su página falle es transitorio y no lo saca del
        // sitemap (nginx sirve el SPA mientras tanto; el siguiente pase la regenera).
        _sitemapWriter.Verify(
            w => w.WriteAsync(
                It.Is<IReadOnlyCollection<string>>(slugs =>
                    slugs.Count == 2 && slugs.Contains("roto") && slugs.Contains("sano")),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Regenerate_all_refreshes_the_discovery_index_with_the_public_catalogs()
    {
        var synchronizer = CreateSynchronizer();
        ArrangePublishedCatalog("mercado-uno");
        ArrangePublishedCatalog("mercado-dos");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno", "mercado-dos" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(2, 2, 0));
        _sitemapWriter.Verify(
            w => w.WriteAsync(
                It.Is<IReadOnlyCollection<string>>(slugs =>
                    slugs.Count == 2 && slugs.Contains("mercado-uno") && slugs.Contains("mercado-dos")),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Regenerate_all_keeps_the_pass_alive_when_the_index_fails()
    {
        var synchronizer = CreateSynchronizer();
        ArrangePublishedCatalog("mercado-uno");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _sitemapWriter
            .Setup(w => w.WriteAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("volumen de solo lectura"));

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(1, 1, 0));
    }

    [Fact]
    public async Task Regenerate_all_counts_a_catalog_without_page_as_not_written()
    {
        var synchronizer = CreateSynchronizer();
        ArrangePublishedCatalog("sin-slug-ya");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "sin-slug-ya" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var result = await synchronizer.RegenerateAllAsync();

        result.Should().Be(new CatalogStaticPageSyncResult(1, 0, 0));
    }

    [Fact]
    public async Task Regenerate_all_propagates_cancellation_instead_of_counting_it_as_a_failure()
    {
        var synchronizer = CreateSynchronizer();
        ArrangePublishedCatalog("mercado-uno");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());

        var act = async () => await synchronizer.RegenerateAllAsync();

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task Regenerate_all_propagates_index_cancellation()
    {
        var synchronizer = CreateSynchronizer();
        ArrangePublishedCatalog("mercado-uno");
        _storeRepository.Setup(r => r.GetCatalogSlugsAsync()).ReturnsAsync(new[] { "mercado-uno" });
        _generator
            .Setup(g => g.GenerateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        _sitemapWriter
            .Setup(w => w.WriteAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());

        var act = async () => await synchronizer.RegenerateAllAsync();

        await act.Should().ThrowAsync<OperationCanceledException>();
    }
}
