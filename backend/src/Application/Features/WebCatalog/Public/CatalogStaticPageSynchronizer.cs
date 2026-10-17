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
        private readonly CatalogStaticPageOptions _options;
        private readonly ILogger<CatalogStaticPageSynchronizer> _logger;

        public CatalogStaticPageSynchronizer(
            IStoreRepository storeRepository,
            ICatalogStaticPageGenerator generator,
            IOptions<CatalogStaticPageOptions> options,
            ILogger<CatalogStaticPageSynchronizer> logger)
        {
            _storeRepository = storeRepository;
            _generator = generator;
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

            foreach (var slug in slugs)
            {
                try
                {
                    // El slug es único global; resolverlo así (sin sesión) es lo que acota el
                    // resultado y lo que descarta catálogos que dejaron de ser públicos.
                    var store = await _storeRepository.GetStoreByCatalogSlugAsync(slug);
                    if (store is null)
                        continue;

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

            _logger.LogInformation(
                "Páginas estáticas de catálogo regeneradas: {Written}/{Candidates} escritas, {Failed} fallidas.",
                written,
                slugs.Count,
                failed);

            return new CatalogStaticPageSyncResult(slugs.Count, written, failed);
        }
    }
}
