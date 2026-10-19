using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>Resultado de una pasada completa de regeneración de páginas estáticas de catálogo.</summary>
    public sealed record CatalogStaticPageSyncResult(int Candidates, int Written, int Failed);

    /// <summary>
    /// T6: regenera la página estática de TODOS los catálogos publicados de una sola pasada. Es lo
    /// que corre al arrancar la API (backfill de los catálogos existentes) y cuando cambia el shell
    /// del SPA (cada deploy del frontend, porque el shell referencia assets hasheados del build).
    /// T7 (S5): la misma pasada deja actualizado el índice de descubrimiento — <c>sitemap.xml</c> con
    /// los catálogos públicos y <c>robots.txt</c>— en la raíz del volumen compartido.
    /// </summary>
    public interface ICatalogStaticPageSynchronizer
    {
        Task<CatalogStaticPageSyncResult> RegenerateAllAsync(CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Best-effort POR CATÁLOGO (misma política que <see cref="CatalogStaticPageRegenerator"/>): que
    /// un catálogo falle no puede impedir que los demás se regeneren. Un slug que ya no es público
    /// se salta sin contarlo como fallo, y donde la feature no está configurada se calla. Si el
    /// shell todavía no está publicado no hay nada que generar: se registra y ya — el sincronizador
    /// volverá cuando el shell aparezca.
    /// </summary>
    public sealed class CatalogStaticPageSynchronizer : ICatalogStaticPageSynchronizer
    {
        private readonly IStoreRepository _storeRepository;
        private readonly ICatalogStaticPageGenerator _generator;
        private readonly ICatalogStaticPageSitemapWriter _sitemapWriter;
        private readonly CatalogStaticPageOptions _options;
        private readonly ILogger<CatalogStaticPageSynchronizer> _logger;

        public CatalogStaticPageSynchronizer(
            IStoreRepository storeRepository,
            ICatalogStaticPageGenerator generator,
            ICatalogStaticPageSitemapWriter sitemapWriter,
            IOptions<CatalogStaticPageOptions> options,
            ILogger<CatalogStaticPageSynchronizer> logger)
        {
            _storeRepository = storeRepository;
            _generator = generator;
            _sitemapWriter = sitemapWriter;
            _options = options.Value;
            _logger = logger;
        }

        public async Task<CatalogStaticPageSyncResult> RegenerateAllAsync(CancellationToken cancellationToken = default)
        {
            if (!_options.IsEnabled)
                return new CatalogStaticPageSyncResult(0, 0, 0);

            var shellPath = _options.ShellPath;
            if (string.IsNullOrWhiteSpace(shellPath) || !File.Exists(shellPath))
            {
                _logger.LogInformation(
                    "Todavía no hay shell del SPA en {ShellPath}; no se regeneran páginas estáticas de catálogo.",
                    shellPath);
                return new CatalogStaticPageSyncResult(0, 0, 0);
            }

            var slugs = await _storeRepository.GetCatalogSlugsAsync();
            var written = 0;
            var failed = 0;
            var published = new List<string>();

            foreach (var slug in slugs)
            {
                try
                {
                    // El slug es único global; resolverlo así (sin sesión) es lo que acota el
                    // resultado y lo que descarta catálogos que dejaron de ser públicos.
                    var store = await _storeRepository.GetStoreByCatalogSlugAsync(slug);
                    if (store is null)
                        continue;

                    // Resolver la tienda es lo que PUBLICa el slug: el índice de descubrimiento
                    // (sitemap.xml) lista exactamente los que resuelven — un slug cuya tienda (o su
                    // dueño) ya no está activo queda fuera aunque la columna siga puesta.
                    published.Add(slug);

                    if (await _generator.GenerateAsync(store.Id, cancellationToken))
                        written++;
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    failed++;
                    _logger.LogWarning(
                        exception,
                        "No se pudo regenerar la página estática del catálogo {Slug}; los demás siguen generándose.",
                        slug);
                }
            }

            try
            {
                await _sitemapWriter.WriteAsync(published, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // El índice es decoración de descubrimiento: si no se puede escribir, las páginas
                // generadas siguen sirviéndose y la próxima pasada lo reintenta.
                _logger.LogWarning(
                    exception,
                    "No se pudieron actualizar sitemap.xml/robots.txt; los catálogos publicados siguen sirviéndose.");
            }

            _logger.LogInformation(
                "Páginas estáticas de catálogo regeneradas: {Written}/{Candidates} escritas, {Failed} fallidas; " +
                "sitemap.xml con {Published} catálogos públicos.",
                written,
                slugs.Count,
                failed,
                published.Count);

            return new CatalogStaticPageSyncResult(slugs.Count, written, failed);
        }
    }
}
