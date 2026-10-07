using Application.Abstractions.Storage;
using Microsoft.Extensions.Options;

namespace Infrastructure.Storage
{
    /// <summary>Configuración del almacenamiento de imágenes del catálogo (sección "Storage").</summary>
    public sealed class CatalogImageStorageOptions
    {
        /// <summary>
        /// Raíz donde se guardan las imágenes. Absoluta en el VPS (volumen persistente); si es
        /// relativa se resuelve contra el directorio de trabajo de la API.
        /// </summary>
        public string CatalogImageRoot { get; set; } = "storage/catalog";
    }

    /// <summary>
    /// Guarda las imágenes del catálogo en disco con la estructura
    /// <c>{tenantId}/{storeId}/{productId}/{guid}{ext}</c> (decisión D3, plan 2026-09-27), y las de
    /// MARCA con <c>{tenantId}/{storeId}/branding/{kind}/{guid}{ext}</c> (F8).
    /// </summary>
    public sealed class CatalogImageStorage : ICatalogImageStorage
    {
        /// <summary>Carpeta que separa las imágenes de MARCA de las de producto (F8).</summary>
        private const string BrandingFolder = "branding";

        private static readonly Dictionary<string, string> ContentTypesByExtension = new(StringComparer.OrdinalIgnoreCase)
        {
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".png"] = "image/png",
            [".webp"] = "image/webp",
        };

        private readonly CatalogImageStorageOptions _options;

        public CatalogImageStorage(IOptions<CatalogImageStorageOptions> options)
        {
            _options = options.Value;
        }

        public Task<string> SaveAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, Guid productId,
            CancellationToken cancellationToken = default)
        {
            string key = string.Join('/',
                tenantId.ToString("N"),
                storeId.ToString("N"),
                productId.ToString("N"),
                Guid.NewGuid().ToString("N") + ResolveExtension(upload));

            return WriteAsync(key, upload, cancellationToken);
        }

        /// <summary>
        /// Guarda el logo o el banner de la tienda. El `kind` va en la ruta, así que se sanea: lo
        /// pone el backend ("logo"/"banner") y nunca el cliente, pero una clave con separadores
        /// escondería un nivel de carpeta y <see cref="ResolveFullPath"/> solo protege contra
        /// traversal, no contra eso.
        /// </summary>
        public Task<string> SaveBrandingAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, string kind,
            CancellationToken cancellationToken = default)
        {
            string key = string.Join('/',
                tenantId.ToString("N"),
                storeId.ToString("N"),
                BrandingFolder,
                SanitizeKind(kind),
                Guid.NewGuid().ToString("N") + ResolveExtension(upload));

            return WriteAsync(key, upload, cancellationToken);
        }

        /// <summary>
        /// Escribe el archivo de una clave ya compuesta. Lo comparten las dos formas de clave: la
        /// parte que decide DÓNDE va el archivo es la que compone la clave, no la que escribe.
        /// </summary>
        private async Task<string> WriteAsync(string key, CatalogImageUpload upload,
            CancellationToken cancellationToken)
        {
            string fullPath = ResolveFullPath(key);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

            await using (FileStream target = File.Create(fullPath))
            {
                await upload.Content.CopyToAsync(target, cancellationToken);
            }

            return key;
        }

        /// <summary>
        /// Extensión del archivo por la del nombre y, si no se reconoce, por el content type. Sin
        /// ninguna de las dos se guarda SIN extensión en vez de inventar una que no corresponde.
        /// </summary>
        private string ResolveExtension(CatalogImageUpload upload)
        {
            string extension = Path.GetExtension(upload.FileName ?? string.Empty).ToLowerInvariant();
            if (!ContentTypesByExtension.ContainsKey(extension))
                extension = ExtensionFromContentType(upload.ContentType);

            return extension;
        }

        /// <summary>
        /// Reduce el `kind` a un único segmento de carpeta: minúsculas, y cualquier carácter que no
        /// sea alfanumérico (ni el propio separador) se convierte en <c>-</c>. Con eso
        /// <c>../../etc</c> no abre nada y la clave sigue teniendo siempre los mismos segmentos.
        /// Un `kind` que no deja nada utilizable se rechaza: una clave ambigua sería imposible de
        /// explicar y de depurar.
        /// </summary>
        private static string SanitizeKind(string kind)
        {
            var sanitized = new System.Text.StringBuilder(kind.Length);
            foreach (char character in kind ?? string.Empty)
            {
                // Solo alfanumérico pasa; el resto colapsa en un único guion, incluidos los
                // separadores, los puntos y los espacios.
                char mapped = char.IsAsciiLetterOrDigit(character) ? char.ToLowerInvariant(character) : '-';
                if (mapped == '-' && sanitized.Length > 0 && sanitized[^1] == '-')
                    continue;

                sanitized.Append(mapped);
            }

            string result = sanitized.ToString().Trim('-');
            if (result.Length == 0)
                throw new ArgumentException(
                    $"El tipo de imagen de marca '{kind}' no deja un segmento de carpeta válido.", nameof(kind));

            return result;
        }

        public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
        {
            if (!string.IsNullOrWhiteSpace(key))
            {
                string fullPath = ResolveFullPath(key);
                if (File.Exists(fullPath))
                    File.Delete(fullPath);
            }

            return Task.CompletedTask;
        }

        public Task<CatalogStoredImage?> OpenAsync(string key, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(key))
                return Task.FromResult<CatalogStoredImage?>(null);

            string fullPath = ResolveFullPath(key);
            if (!File.Exists(fullPath))
                return Task.FromResult<CatalogStoredImage?>(null);

            string extension = Path.GetExtension(key);
            string contentType = ContentTypesByExtension.TryGetValue(extension, out string? known)
                ? known
                : "application/octet-stream";

            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            return Task.FromResult<CatalogStoredImage?>(new CatalogStoredImage(stream, contentType, stream.Length));
        }

        public bool BelongsToStore(string key, Guid tenantId, Guid storeId)
        {
            if (string.IsNullOrWhiteSpace(key))
                return false;

            string expectedPrefix = tenantId.ToString("N") + "/" + storeId.ToString("N") + "/";
            return key.Replace('\\', '/').StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase);
        }

        private string ResolveFullPath(string key)
        {
            string root = Path.IsPathRooted(_options.CatalogImageRoot)
                ? _options.CatalogImageRoot
                : Path.Combine(Directory.GetCurrentDirectory(), _options.CatalogImageRoot);

            string relative = key.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);

            // Defensa contra traversal: la clave se compone en el backend, pero nunca se confía.
            string fullPath = Path.GetFullPath(Path.Combine(root, relative));
            string fullRoot = Path.GetFullPath(root);
            if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Clave de imagen fuera de la raíz del catálogo: '{key}'.");

            return fullPath;
        }

        private static string ExtensionFromContentType(string? contentType)
            => contentType?.ToLowerInvariant() switch
            {
                "image/jpeg" => ".jpg",
                "image/png" => ".png",
                "image/webp" => ".webp",
                _ => string.Empty,
            };
    }
}
