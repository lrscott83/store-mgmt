using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Configuración de la pre-generación de páginas de catálogo: dónde está el shell del SPA
    /// (el <c>index.html</c> construido) y dónde se escriben las páginas servibles.
    /// </summary>
    public sealed class CatalogStaticPageOptions
    {
        /// <summary>Nombre de la sección de configuración (appsettings).</summary>
        public const string SectionName = "CatalogStaticPage";

        /// <summary>Ruta al <c>index.html</c> del SPA (shell) que se usa como plantilla.</summary>
        public string? ShellPath { get; set; }

        /// <summary>Directorio raíz bajo el que se escriben <c>catalog/&lt;slug&gt;/index.html</c>.</summary>
        public string? OutputRoot { get; set; }

        /// <summary>
        /// URL pública absoluta del sitio (p. ej. <c>https://pos.playground.sceiba.net</c>), sin
        /// barra final. La usan el canonical y las URLs de imagen, que deben ser absolutas porque el
        /// HTML se sirve estático y los rastreadores no resuelven rutas relativas.
        /// </summary>
        public string? PublicBaseUrl { get; set; }

        /// <summary>
        /// Publicar la superficie pública para los buscadores. El default es el comportamiento de
        /// producción (indexable): un entorno donde la bandera no esté configurada, o esté mal
        /// escrita, sigue indexando. Solo el entorno de pruebas la pone en <c>false</c> por
        /// configuración (<c>CatalogStaticPage__AllowIndexing</c>), y allí <c>robots.txt</c> prohíbe
        /// el rastreo completo y el sitemap se publica sin URLs.
        /// </summary>
        public bool AllowIndexing { get; set; } = true;

        /// <summary>
        /// Segundos entre comprobaciones del shell del SPA (T6). El valor mínimo efectivo es 5 s
        /// (<see cref="SynchronizationInterval"/>): un 0 accidental no puede convertirse en un bucle.
        /// </summary>
        public int SynchronizationIntervalSeconds { get; set; } = 30;

        /// <summary>Intervalo efectivo del sincronizador, ya acotado al mínimo.</summary>
        public TimeSpan SynchronizationInterval => TimeSpan.FromSeconds(Math.Max(5, SynchronizationIntervalSeconds));

        /// <summary>Tope duro de <see cref="ItemListSize"/>: el mismo <c>MaxPageSize</c> de la query pública.</summary>
        public const int MaxItemListSize = 60;

        /// <summary>
        /// Productos que entran en el JSON-LD <c>ItemList</c>. El default 12 NO es arbitrario: es el
        /// <c>PAGE_SIZE</c> del catálogo público (<c>public-catalog.tsx</c>), la primera página que ve
        /// el visitante, así el markup describe exactamente lo que la página muestra. Se acota a
        /// 1..<see cref="MaxItemListSize"/> para que una configuración errónea no genere un HTML enorme.
        /// </summary>
        public int ItemListSize { get; set; } = 12;

        /// <summary>Valor efectivo de <see cref="ItemListSize"/>, acotado.</summary>
        public int EffectiveItemListSize => Math.Clamp(ItemListSize, 1, MaxItemListSize);

        /// <summary>
        /// Ruta de la imagen de marca usada como <c>og:image</c> cuando el catálogo no tiene logo ni
        /// banner, relativa a <see cref="PublicBaseUrl"/>. Evita compartir el catálogo sin miniatura.
        /// </summary>
        public string DefaultImagePath { get; set; } = "/og-image.png";

        /// <summary>
        /// La pre-generación está CONFIGURADA en este entorno. Distingue "apagada" de "rota": sin
        /// <see cref="ShellPath"/> ni <see cref="OutputRoot"/> la feature no aplica (dev, tests, un
        /// contenedor sin el volumen montado), así que el regenerador best-effort se calla en vez de
        /// registrar un fallo por cada guardado. Un error real —configurada pero no puede escribir—
        /// sí se registra.
        /// </summary>
        public bool IsEnabled =>
            !string.IsNullOrWhiteSpace(ShellPath) && !string.IsNullOrWhiteSpace(OutputRoot);
    }

    /// <summary>Escribe la página estática de un catálogo público (feature public-catalog-static-pages, S1/S2).</summary>
    public interface ICatalogStaticPageWriter
    {
        Task WriteAsync(string storeSlug, CatalogStaticPageMeta meta, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// T2: lee el shell del SPA desde <see cref="CatalogStaticPageOptions.ShellPath"/>, le inyecta los
    /// metadatos con <see cref="CatalogStaticPageBuilder"/> y escribe el resultado en
    /// <c>&lt;OutputRoot&gt;/catalog/&lt;slug&gt;/index.html</c> — la ruta que nginx servirá directo
    /// (S4). Solo escribe en disco: la generación no conoce el POS ni la BD del POS.
    /// </summary>
    public sealed class CatalogStaticPageWriter : ICatalogStaticPageWriter
    {
        /// <summary>Slug seguro: kebab-case; rechaza cualquier intento de salir del directorio.</summary>
        private static readonly Regex SafeSlug = new("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", RegexOptions.Compiled);

        private readonly CatalogStaticPageOptions _options;

        public CatalogStaticPageWriter(IOptions<CatalogStaticPageOptions> options)
            => _options = options.Value;

        public async Task WriteAsync(string storeSlug, CatalogStaticPageMeta meta, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(storeSlug))
                throw new ArgumentException("storeSlug is required", nameof(storeSlug));
            if (!SafeSlug.IsMatch(storeSlug))
                throw new ArgumentException($"unsafe store slug: '{storeSlug}'", nameof(storeSlug));
            if (meta is null)
                throw new ArgumentNullException(nameof(meta));

            var shellPath = _options.ShellPath;
            if (string.IsNullOrWhiteSpace(shellPath))
                throw new InvalidOperationException("CatalogStaticPageOptions.ShellPath is not configured");

            var outputRoot = _options.OutputRoot;
            if (string.IsNullOrWhiteSpace(outputRoot))
                throw new InvalidOperationException("CatalogStaticPageOptions.OutputRoot is not configured");

            if (!File.Exists(shellPath))
                throw new FileNotFoundException($"SPA shell not found at '{shellPath}'", shellPath);

            var shell = await File.ReadAllTextAsync(shellPath, cancellationToken);
            var html = CatalogStaticPageBuilder.Build(shell, meta);

            var directory = Path.Combine(outputRoot, "catalog", storeSlug);
            Directory.CreateDirectory(directory);

            // Corrección R4: la página se publica con un rename atómico — se escribe completa en un
            // temporal del mismo directorio y se mueve sobre index.html. Un fallo a mitad de escritura
            // (crash, disco lleno) deja a lo sumo el temporal como residuo, nunca la ruta servible a
            // medias: nginx sigue sirviendo la página anterior o cae al SPA, no un HTML truncado.
            var pagePath = Path.Combine(directory, "index.html");
            var temporaryPath = Path.Combine(directory, $".index.html.{Guid.NewGuid():N}.tmp");
            try
            {
                await File.WriteAllTextAsync(
                    temporaryPath, html, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), cancellationToken);
                File.Move(temporaryPath, pagePath, overwrite: true);
            }
            catch
            {
                try { File.Delete(temporaryPath); }
                catch { /* residuo no servible: lo limpia el siguiente pase */ }
                throw;
            }
        }
    }
}
