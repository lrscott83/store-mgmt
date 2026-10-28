using Domain.Common.Entities;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreSyncFiles
{
    /// <summary>
    /// Un fichero de sincronización del POS: el ZIP cifrado que el POS ya exporta, guardado tal
    /// cual en disco (S13). El backend NO lo inspecciona, no lo descifra y no lo re-cifra: los
    /// bytes son OPAQUES y la contraseña nunca llega aquí.
    ///
    /// Cada fila es UN fichero de UNA sola tienda (S1). El ZIP multi-tienda cifra todas las
    /// tiendas con la misma llave, así que un StoreUser podría leer las de otra; por eso el
    /// cliente genera un archivo por tienda y esta tabla guarda la tienda a la que pertenece.
    ///
    /// <see cref="StoreName"/> y <see cref="UploadedByFullName"/> son FOTOGRAFÍAS del momento del
    /// alta, no joins al leer: si el dueño renombra la tienda o el usuario cambia su nombre, el
    /// historial del repositorio debe seguir diciendo quién subió qué y cuándo. Es el mismo
    /// criterio que un precio congelado en una línea de pedido.
    /// </summary>
    public sealed class StoreSyncFile : AuditableEntity<Guid>, ITenantBaseEntity
    {
        /// <summary>Tienda a la que pertenece el fichero. Es el aislamiento real del repositorio.</summary>
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;

        /// <summary>Nombre ORIGINAL del fichero, tal como lo generó el POS.</summary>
        public string FileName { get; set; }

        /// <summary>Content type declarado en el alta. Se conserva aunque la descarga sirva ZIP.</summary>
        public string ContentType { get; set; }

        /// <summary>Tamaño en bytes del blob guardado.</summary>
        public long SizeBytes { get; set; }

        /// <summary>
        /// Clave RELATIVA del blob dentro de la raíz de sincronización
        /// (<c>{tenantId}/{storeId}/{fileId}.zip</c>). Es lo único que se persiste del archivo; las
        /// rutas absolutas del servidor nunca salen del almacenamiento.
        /// </summary>
        public string StorageKey { get; set; }

        /// <summary>Usuario que subió el fichero (id de <c>User</c>).</summary>
        public Guid UploadedByUserId { get; set; }

        /// <summary>Nombre completo del usuario que lo subió, CONGELADO en el alta.</summary>
        public string UploadedByFullName { get; set; }

        /// <summary>Nombre de la tienda, CONGELADO en el alta.</summary>
        public string StoreName { get; set; }

        /// <summary>
        /// Cuántas descargas acumula el fichero. Es informativo (S3): no limita nada y no bloquea
        /// una segunda descarga (S4).
        /// </summary>
        public int DownloadCount { get; set; }

        /// <summary>Marcas de descarga por usuario. Se borran con la fila (FK Restrict + baja lógica).</summary>
        public ICollection<StoreSyncFileDownload> Downloads { get; set; } = new List<StoreSyncFileDownload>();

        public Guid TenantId { get; set; }

        private StoreSyncFile(Guid id, Guid storeId, Guid tenantId, string fileName, string contentType,
            long sizeBytes, string storageKey, Guid uploadedByUserId, string uploadedByFullName, string storeName)
            : base(id)
        {
            StoreId = storeId;
            TenantId = tenantId;
            FileName = fileName;
            ContentType = contentType;
            SizeBytes = sizeBytes;
            StorageKey = storageKey;
            UploadedByUserId = uploadedByUserId;
            UploadedByFullName = uploadedByFullName;
            StoreName = storeName;
            DownloadCount = 0;
            IsActive = true;
        }

        /// <summary>
        /// Crea la fila de un fichero. NO escribe el blob: eso lo hace el comando, que es quien
        /// conoce el almacenamiento y valida el ámbito ANTES de tocar el disco.
        /// </summary>
        public static StoreSyncFile Create(Guid storeId, Guid tenantId, string fileName, string contentType,
            long sizeBytes, string storageKey, Guid uploadedByUserId, string uploadedByFullName, string storeName)
            => Create(Guid.NewGuid(), storeId, tenantId, fileName, contentType, sizeBytes, storageKey,
                uploadedByUserId, uploadedByFullName, storeName);

        /// <summary>
        /// Crea la fila con un id CONOCIDO. Lo necesita el alta real: la clave del blob incluye el
        /// id del fichero, así que el id tiene que existir antes de escribir el archivo.
        /// Mismo criterio que <c>StoreCatalogImage.Create(Guid id, ...)</c>.
        /// </summary>
        public static StoreSyncFile Create(Guid id, Guid storeId, Guid tenantId, string fileName,
            string contentType, long sizeBytes, string storageKey, Guid uploadedByUserId,
            string uploadedByFullName, string storeName)
            => new(id, storeId, tenantId, fileName, contentType, sizeBytes, storageKey,
                uploadedByUserId, uploadedByFullName, storeName);
    }
}
