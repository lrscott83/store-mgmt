using Domain.Common.Entities;

namespace Domain.Entities.StoreSyncFiles
{
    /// <summary>
    /// Marca de descarga de UN usuario sobre UN fichero de sincronización (S4).
    ///
    /// Es INFORMATIVA: sirve para que la pantalla diga "descargado el &lt;fecha&gt;", no para
    /// bloquear. Un mismo usuario puede volver a descargar el fichero cuantas veces quiera; el
    /// índice único (fichero, usuario) garantiza que la marca sea una sola y el contador del
    /// fichero (<see cref="StoreSyncFile.DownloadCount"/>) cuenta TODAS las descargas.
    ///
    /// Lleva <c>TenantId</c> porque, igual que el fichero, se lee siempre dentro de la sesión de un
    /// tenant: el filtro global del <c>ApplicationDbContext</c> es el que impide que las marcas de
    /// otra instalación se mezclen con las de esta.
    /// </summary>
    public sealed class StoreSyncFileDownload : AuditableEntity<Guid>, ITenantBaseEntity
    {
        /// <summary>Fichero descargado.</summary>
        public Guid StoreSyncFileId { get; set; }
        public StoreSyncFile StoreSyncFile { get; set; } = null!;

        /// <summary>Usuario que lo descargó (id de <c>User</c>). La marca es POR USUARIO, no por dispositivo.</summary>
        public Guid UserId { get; set; }

        /// <summary>Cuándo lo descargó por PRIMERA vez. Es la fecha que muestra la pantalla.</summary>
        public DateTimeOffset DownloadedAt { get; set; }

        public Guid TenantId { get; set; }

        private StoreSyncFileDownload(Guid id, Guid storeSyncFileId, Guid userId, Guid tenantId,
            DateTimeOffset downloadedAt) : base(id)
        {
            StoreSyncFileId = storeSyncFileId;
            UserId = userId;
            TenantId = tenantId;
            DownloadedAt = downloadedAt;
            IsActive = true;
        }

        public static StoreSyncFileDownload Create(Guid storeSyncFileId, Guid userId, Guid tenantId,
            DateTimeOffset downloadedAt)
            => Create(Guid.NewGuid(), storeSyncFileId, userId, tenantId, downloadedAt);

        /// <summary>
        /// Crea la marca con un id CONOCIDO, para tests y seeds que necesiten fijarlo. Mismo
        /// criterio que <see cref="StoreSyncFile.Create(Guid, Guid, Guid, string, string, long, string, Guid, string, string)"/>.
        /// </summary>
        public static StoreSyncFileDownload Create(Guid id, Guid storeSyncFileId, Guid userId, Guid tenantId,
            DateTimeOffset downloadedAt)
            => new(id, storeSyncFileId, userId, tenantId, downloadedAt);
    }
}
