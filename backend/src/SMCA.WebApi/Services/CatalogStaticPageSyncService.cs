using Application.Features.WebCatalog.Public;
using Microsoft.Extensions.Options;

namespace SMCA.WebApi.Services
{
    /// <summary>
    /// T6: mantiene las páginas estáticas de catálogo al día sin que nadie toque el deploy.
    ///
    /// Al arrancar la API corre una pasada completa — es el backfill de los catálogos ya existentes
    /// (S3) — y después vigila la firma del shell del SPA: cada build del frontend reemplaza el
    /// <c>index.html</c> del volumen por uno que referencia assets hasheados distintos, así que una
    /// firma nueva significa "deploy nuevo" y dispara otra pasada completa (S9). Las páginas viejas
    /// no sobreviven a un deploy del frontend.
    ///
    /// Intervalo configurable en <c>CatalogStaticPage:SynchronizationIntervalSeconds</c> (mínimo
    /// efectivo 5 s, default 30 s). Sin la feature configurada el servicio no hace nada: ni
    /// siquiera abre una conexión a la base de datos.
    /// </summary>
    public sealed class CatalogStaticPageSyncService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly CatalogStaticPageOptions _options;
        private readonly ILogger<CatalogStaticPageSyncService> _logger;

        public CatalogStaticPageSyncService(
            IServiceScopeFactory scopeFactory,
            IOptions<CatalogStaticPageOptions> options,
            ILogger<CatalogStaticPageSyncService> logger)
        {
            _scopeFactory = scopeFactory;
            _options = options.Value;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_options.IsEnabled)
                return;

            _logger.LogInformation(
                "Sincronizador de páginas estáticas de catálogo activo (shell: {ShellPath}, cada {IntervalSeconds} s).",
                _options.ShellPath,
                _options.SynchronizationInterval.TotalSeconds);

            string? lastSignature = null;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var signature = CatalogStaticPageShellSignature.Compute(_options.ShellPath);

                    // Firma null = todavía no hay shell publicado: el contenedor del frontend puede
                    // arrancar después que la API. Cuando aparezca, esa primera firma real dispara
                    // la pasada — es el backfill que pide S3.
                    if (signature is not null && signature != lastSignature)
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var synchronizer = scope.ServiceProvider.GetRequiredService<ICatalogStaticPageSynchronizer>();
                        var result = await synchronizer.RegenerateAllAsync(stoppingToken);

                        // La firma se marca como procesada SOLO si la pasada terminó. Un fallo
                        // global (BD aún no lista, por ejemplo) se reintenta al siguiente ciclo en
                        // vez de dejar las páginas viejas esperando al próximo deploy.
                        lastSignature = signature;

                        _logger.LogInformation(
                            "Shell nuevo detectado ({Fingerprint}): páginas estáticas regeneradas ({Written}/{Candidates}, {Failed} fallidas).",
                            signature[..12],
                            result.Written,
                            result.Candidates,
                            result.Failed);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(
                        exception,
                        "Falló una pasada del sincronizador de páginas estáticas; se reintentará en el próximo ciclo.");
                }

                try
                {
                    await Task.Delay(_options.SynchronizationInterval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }
}
