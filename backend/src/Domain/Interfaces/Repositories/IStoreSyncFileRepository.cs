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
        /// Ficheros ACTIVOS de las tiendas indicadas, del más reciente al más antiguo (S3). El
        /// conjunto sale del MISMO ámbito que autoriza las acciones (R3-3): una lista vacía devuelve
        /// una lista vacía, nunca "todas".
        /// </summary>
        Task<IReadOnlyList<StoreSyncFile>> GetActiveOrderedByDateAsync(
            IReadOnlyCollection<Guid> storeIds, CancellationToken cancellationToken = default);

        /// <summary>Un fichero ACTIVO por su id, o null si no existe, está de baja o es de otro tenant.</summary>
        Task<StoreSyncFile?> GetActiveByIdAsync(Guid id, CancellationToken cancellationToken = default);

        /// <summary>
        /// Marcas de descarga del usuario para los ficheros indicados. Se pide en lote —y no una
        /// consulta por fila— porque la lista puede traer todos los ficheros del tenant (S3).
        /// </summary>
        Task<IReadOnlyList<StoreSyncFileDownload>> GetDownloadsByUserAsync(Guid userId,
            IReadOnlyCollection<Guid> storeSyncFileIds, CancellationToken cancellationToken = default);

        /// <summary>
        /// Registra la marca de descarga de forma IDEMPOTENTE: inserta la fila y, si ya existía para
        /// ese (fichero, usuario), la ignora.
        ///
        /// Es un upsert en SQL y no "leer y luego insertar" a propósito (R3-2 de la revisión): dos
        /// descargas simultáneas del mismo usuario leerían ambas "no hay marca" y la segunda chocaría
        /// contra el índice único, devolviendo un 500 en una operación que el usuario ya había hecho
        /// bien. Devuelve true si insertó la marca y false si ya estaba.
        /// </summary>
        Task<bool> MarkDownloadAsync(StoreSyncFileDownload download,
            CancellationToken cancellationToken = default);

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
