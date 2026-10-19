using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Regeneración BEST-EFFORT de la página estática de un catálogo. Es lo que llaman los flujos
    /// que cambian los datos de la página; nunca lanza.
    /// </summary>
    public interface ICatalogStaticPageRegenerator
    {
        Task RegenerateAsync(Guid storeId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// T4: dispara la generación sin poner en riesgo la operación que la provocó. La página estática
    /// es una DECORACIÓN sobre el SPA: si no se puede regenerar (shell aún no publicado, disco, etc.),
    /// nginx sigue sirviendo el SPA y el catálogo funciona igual (S4). Por eso cualquier fallo se
    /// registra y se traga — guardar la marca del catálogo no puede fallar porque la página estática
    /// no se haya podido escribir. La cancelación también se traga, por la misma razón: el guardado ya
    /// ocurrió y la cancelación no es un error de la página.
    ///
    /// Y si la feature está APAGADA en este entorno (<see cref="CatalogStaticPageOptions.IsEnabled"/>
    /// falso: dev, tests, un contenedor sin el volumen) se calla sin registrar nada: no poder
    /// pre-generar donde no está configurada no es un fallo.
    /// </summary>
    public sealed class CatalogStaticPageRegenerator : ICatalogStaticPageRegenerator
    {
        private readonly ICatalogStaticPageGenerator _generator;
        private readonly CatalogStaticPageOptions _options;
        private readonly ILogger<CatalogStaticPageRegenerator> _logger;

        public CatalogStaticPageRegenerator(
            ICatalogStaticPageGenerator generator,
            IOptions<CatalogStaticPageOptions> options,
            ILogger<CatalogStaticPageRegenerator> logger)
        {
            _generator = generator;
            _options = options.Value;
            _logger = logger;
        }

        public async Task RegenerateAsync(Guid storeId, CancellationToken cancellationToken = default)
        {
            if (!_options.IsEnabled)
                return;

            try
            {
                await _generator.GenerateAsync(storeId, cancellationToken);
            }
            catch (Exception exception)
            {
                _logger.LogWarning(
                    exception,
                    "No se pudo regenerar la página estática del catálogo de la tienda {StoreId}; " +
                    "el catálogo sigue sirviéndose como SPA.",
                    storeId);
            }
        }
    }
}
