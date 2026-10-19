using System.Text;
using Microsoft.Extensions.Options;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// T7 (S5): publica en la RAÍZ del volumen compartido los dos archivos de descubrimiento:
    /// <c>sitemap.xml</c> (una URL por catálogo publicado) y <c>robots.txt</c> (que lo referencia).
    /// </summary>
    public interface ICatalogStaticPageSitemapWriter
    {
        Task WriteAsync(IReadOnlyCollection<string> publishedSlugs, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Escribe el índice de descubrimiento con la MISMA disciplina que el escritor de páginas
    /// (<see cref="CatalogStaticPageWriter"/>): configuración explícita, UTF-8 sin BOM y reemplazo
    /// atómico (temporal en el mismo directorio + rename) para no servir jamás un archivo a medias.
    /// Solo escribe en disco: no conoce el POS ni la BD.
    /// </summary>
    public sealed class CatalogStaticPageSitemapWriter : ICatalogStaticPageSitemapWriter
    {
        private readonly CatalogStaticPageOptions _options;

        public CatalogStaticPageSitemapWriter(IOptions<CatalogStaticPageOptions> options)
            => _options = options.Value;

        public async Task WriteAsync(IReadOnlyCollection<string> publishedSlugs, CancellationToken cancellationToken = default)
        {
            if (publishedSlugs is null)
                throw new ArgumentNullException(nameof(publishedSlugs));

            var outputRoot = _options.OutputRoot;
            if (string.IsNullOrWhiteSpace(outputRoot))
                throw new InvalidOperationException("CatalogStaticPageOptions.OutputRoot is not configured");

            var baseUrl = _options.PublicBaseUrl;
            if (string.IsNullOrWhiteSpace(baseUrl))
                throw new InvalidOperationException("CatalogStaticPageOptions.PublicBaseUrl is not configured");

            Directory.CreateDirectory(outputRoot);

            await WriteAtomicAsync(
                Path.Combine(outputRoot, "sitemap.xml"),
                CatalogStaticPageSitemapBuilder.BuildSitemap(baseUrl!, publishedSlugs),
                cancellationToken);
            await WriteAtomicAsync(
                Path.Combine(outputRoot, "robots.txt"),
                CatalogStaticPageSitemapBuilder.BuildRobots(baseUrl!),
                cancellationToken);
        }

        private static async Task WriteAtomicAsync(string path, string content, CancellationToken cancellationToken)
        {
            var directory = Path.GetDirectoryName(path)!;
            var temporaryPath = Path.Combine(directory, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
            try
            {
                await File.WriteAllTextAsync(
                    temporaryPath, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), cancellationToken);
                File.Move(temporaryPath, path, overwrite: true);
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
