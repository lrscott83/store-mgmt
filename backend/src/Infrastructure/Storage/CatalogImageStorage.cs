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
    /// <c>{tenantId}/{storeId}/{productId}/{guid}{ext}</c> (decisión D3, plan 2026-09-27).
    /// </summary>
    public sealed class CatalogImageStorage : ICatalogImageStorage
    {
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

        public async Task<string> SaveAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, Guid productId,
            CancellationToken cancellationToken = default)
        {
            string extension = Path.GetExtension(upload.FileName ?? string.Empty).ToLowerInvariant();
            if (!ContentTypesByExtension.ContainsKey(extension))
                extension = ExtensionFromContentType(upload.ContentType);

            string key = string.Join('/',
                tenantId.ToString("N"),
                storeId.ToString("N"),
                productId.ToString("N"),
                Guid.NewGuid().ToString("N") + extension);

            string fullPath = ResolveFullPath(key);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

            await using (FileStream target = File.Create(fullPath))
            {
                await upload.Content.CopyToAsync(target, cancellationToken);
            }

            return key;
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
