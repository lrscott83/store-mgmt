using Domain.Common.Repositories;
using Domain.Entities.StoreSyncFiles;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Repositorio del repositorio de ficheros de sincronización del POS (S1, S3, S4, S5).
    ///
    /// Las consultas NO llevan <c>AsNoTracking()</c>: el <c>ApplicationDbContext</c> ya fija
    /// <c>QueryTrackingBehavior.NoTracking</c> globalmente, y repetirlo aquí solo escondería de
    /// dónde viene el comportamiento. El filtro global por tenant de la configuración EF es lo que
    /// confina todas estas lecturas a la instalación del usuario.
    /// </summary>
    public interface IStoreSyncFileRepository : IGenericRepository<StoreSyncFile, Guid>
    {
        /// <summary>
        /// Ficheros ACTIVOS, del más reciente al más antiguo (S3). <paramref name="storeId"/> null
        /// devuelve los de todas las tiendas visibles para el tenant (Owner/ReSeller); con valor,
        /// solo los de esa tienda (StoreUser, S5).
        /// </summary>
        Task<IReadOnlyList<StoreSyncFile>> GetActiveOrderedByDateAsync(Guid? storeId,
            CancellationToken cancellationToken = default);

        /// <summary>Un fichero ACTIVO por su id, o null si no existe, está de baja o es de otro tenant.</summary>
        Task<StoreSyncFile?> GetActiveByIdAsync(Guid id, CancellationToken cancellationToken = default);

        /// <summary>
        /// Marcas de descarga del usuario para los ficheros indicados. Se pide en lote —y no una
        /// consulta por fila— porque la lista puede traer todos los ficheros del tenant (S3).
        /// </summary>
        Task<IReadOnlyList<StoreSyncFileDownload>> GetDownloadsByUserAsync(Guid userId,
            IReadOnlyCollection<Guid> storeSyncFileIds, CancellationToken cancellationToken = default);

        /// <summary>La marca concreta de (fichero, usuario), o null si ese usuario aún no lo descargó.</summary>
        Task<StoreSyncFileDownload?> GetDownloadAsync(Guid storeSyncFileId, Guid userId,
            CancellationToken cancellationToken = default);

        /// <summary>Registra la marca de descarga. La escribe el UnitOfWork, no este método.</summary>
        Task AddDownloadAsync(StoreSyncFileDownload download);

        /// <summary>
        /// Suma 1 al contador de descargas con un UPDATE atómico
        /// (<c>SET "DownloadCount" = "DownloadCount" + 1</c>).
        ///
        /// Atómico y no "leer, sumar y guardar" a propósito: dos descargas simultáneas leerían el
        /// mismo valor y una pisaría a la otra. Devuelve false si el fichero no existe.
        /// </summary>
        Task<bool> IncrementDownloadCountAsync(Guid storeSyncFileId, Guid userId,
            CancellationToken cancellationToken = default);
    }
}
