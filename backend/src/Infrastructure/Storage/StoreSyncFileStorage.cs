using Application.Abstractions.Storage;
using Microsoft.Extensions.Options;

namespace Infrastructure.Storage
{
    /// <summary>Configuración del almacenamiento de ficheros de sincronización (sección "Storage").</summary>
    public sealed class StoreSyncFileStorageOptions
    {
        /// <summary>
        /// Raíz donde se guardan los ficheros. Absoluta en el VPS (volumen persistente); si es
        /// relativa se resuelve contra el directorio de trabajo de la API, igual que la raíz de las
        /// imágenes del catálogo.
        /// </summary>
        public string SyncFileRoot { get; set; } = "storage/sync";
    }

    /// <summary>
    /// Guarda los ficheros de sincronización del POS en disco con la estructura
    /// <c>{tenantId}/{storeId}/{fileId}.zip</c>.
    ///
    /// Es un reflejo deliberado de <see cref="CatalogImageStorage"/> en las GUARDAS: rechazo de
    /// segmentos de traversal por segmento de ruta, comprobación de contención con
    /// <c>Path.GetFullPath</c> y raíz relativa resuelta contra el directorio de trabajo. Dos
    /// almacenes con reglas de seguridad distintas es cómo una clave acaba leyendo otra carpeta;
    /// aquí las reglas son las mismas aunque el contenido no tenga nada que ver.
    /// </summary>
    public sealed class StoreSyncFileStorage : IStoreSyncFileStorage
    {
        private const string Extension = ".zip";

        private readonly StoreSyncFileStorageOptions _options;

        public StoreSyncFileStorage(IOptions<StoreSyncFileStorageOptions> options)
        {
            _options = options.Value;
        }

        public async Task<string> SaveAsync(StoreSyncFileUpload upload, Guid tenantId, Guid storeId, Guid fileId,
            CancellationToken cancellationToken = default)
        {
            // La clave la compone SIEMPRE el backend a partir de ids que él mismo conoce: el
            // nombre original del fichero no entra en la ruta, así que no puede abrir carpetas.
            string key = string.Join('/',
                tenantId.ToString("N"),
                storeId.ToString("N"),
                fileId.ToString("N") + Extension);

            string fullPath = ResolveFullPath(key);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

            // Escritura ATÓMICA (R3-4): se escribe a un temporal en la MISMA carpeta y se renombra.
            // Escribir directo al destino deja, si la copia falla a mitad (disco lleno, permiso,
            // cliente que corta), un ZIP TRUNCADO en la ruta final — indistinguible de uno bueno
            // para cualquiera que lo descargue después. `File.Move` sobre el mismo volumen es un
            // rename: o no hay fichero, o está completo.
            string temporaryPath = fullPath + ".tmp-" + Guid.NewGuid().ToString("N");

            try
            {
                await using (FileStream target = File.Create(temporaryPath))
                {
                    await upload.Content.CopyToAsync(target, cancellationToken);
                }

                File.Move(temporaryPath, fullPath, overwrite: true);
            }
            catch
            {
                TryDeleteTemporaryFile(temporaryPath);
                throw;
            }

            return key;
        }

        /// <summary>
        /// Limpia el temporal sin dejar que un fallo de limpieza reemplace el error real que se va a
        /// reportar. Un temporal huérfano es basura en disco; una excepción distinta, una pista falsa.
        /// </summary>
        private static void TryDeleteTemporaryFile(string temporaryPath)
        {
            try
            {
                if (File.Exists(temporaryPath))
                    File.Delete(temporaryPath);
            }
            catch
            {
                // Basura en disco, nunca un error distinto del original.
            }
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

        public Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(key))
                return Task.FromResult<Stream?>(null);

            string fullPath = ResolveFullPath(key);
            if (!File.Exists(fullPath))
                return Task.FromResult<Stream?>(null);

            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            return Task.FromResult<Stream?>(stream);
        }

        public bool BelongsToStore(string key, Guid tenantId, Guid storeId)
        {
            if (string.IsNullOrWhiteSpace(key))
                return false;

            string normalized = key.Replace('\\', '/');

            // Un segmento que cambia el destino al normalizar la ruta (`..`, `.`, y también `.. ` o
            // `...`, que Windows recorta a `..`) haría que `{tenantA}/{storeA}/.. /{tenantB}/…`
            // EMPEZARA por el prefijo esperado y aun así leyera otra tienda. Se decide sobre la
            // MISMA forma que se resuelve al abrir, ANTES de comparar.
            if (normalized.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(IsTraversalSegment))
                return false;

            string expectedPrefix = tenantId.ToString("N") + "/" + storeId.ToString("N") + "/";
            return normalized.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase);
        }

        private string ResolveFullPath(string key)
        {
            string root = Path.IsPathRooted(_options.SyncFileRoot)
                ? _options.SyncFileRoot
                : Path.Combine(Directory.GetCurrentDirectory(), _options.SyncFileRoot);

            string relative = key.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);

            // Defensa contra traversal, para CUALQUIER clave (no solo la que valida la pertenencia):
            // un segmento que al recortar es `.`/`..`/vacío cambia de carpeta al resolver la ruta.
            if (relative.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries).Any(IsTraversalSegment))
                throw new InvalidOperationException($"Clave de fichero de sincronización con traversal: '{key}'.");

            string fullPath = Path.GetFullPath(Path.Combine(root, relative));
            string fullRoot = Path.GetFullPath(root);

            // El prefijo termina en el SEPARADOR: sin él, `.../sync-backup/x` comparte el prefijo
            // textual con `.../sync` y escaparía a una carpeta hermana.
            string rootPrefix = fullRoot.EndsWith(Path.DirectorySeparatorChar)
                ? fullRoot
                : fullRoot + Path.DirectorySeparatorChar;

            if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"Clave de fichero de sincronización fuera de la raíz: '{key}'.");

            return fullPath;
        }

        /// <summary>
        /// ¿El segmento escapa del directorio al normalizarse? Windows recorta espacios y puntos
        /// FINALES de cada componente de la ruta (`.. ` y `...` colapsan a `..`), así que un segmento
        /// que se vuelve vacío/`.`/`..` al recortarlos también cambia de carpeta. Se rechaza aunque el
        /// SO de producción (Linux) no recorte: el contrato es que una clave nunca salga de su tienda.
        /// </summary>
        private static bool IsTraversalSegment(string segment)
            => segment.TrimEnd(' ', '.').Length == 0;
    }
}
