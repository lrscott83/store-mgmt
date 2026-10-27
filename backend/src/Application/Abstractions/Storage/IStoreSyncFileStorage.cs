namespace Application.Abstractions.Storage
{
    /// <summary>
    /// Almacenamiento en DISCO de los ficheros de sincronización del POS (S13).
    ///
    /// La clave (<c>key</c>) es relativa y estable, y es lo ÚNICO que se persiste en la base de
    /// datos: las rutas absolutas del servidor nunca salen del almacenamiento. La forma de la
    /// clave es <c>{tenantId}/{storeId}/{fileId}.zip</c>, y el prefijo <c>{tenantId}/{storeId}/</c>
    /// es justo lo que valida <see cref="BelongsToStore"/>.
    ///
    /// El contenido es OPAQUE a propósito: se guarda tal cual llega y se sirve tal cual se leyó.
    /// El backend nunca inspecciona, descifra ni re-cifra el ZIP — la contraseña no llega aquí y
    /// no se almacena en ningún sitio.
    /// </summary>
    public interface IStoreSyncFileStorage
    {
        /// <summary>Guarda el fichero y devuelve la clave relativa que se persiste.</summary>
        Task<string> SaveAsync(StoreSyncFileUpload upload, Guid tenantId, Guid storeId, Guid fileId,
            CancellationToken cancellationToken = default);

        /// <summary>Borra el fichero de una clave. No falla si el fichero ya no existe.</summary>
        Task DeleteAsync(string key, CancellationToken cancellationToken = default);

        /// <summary>
        /// Abre el fichero para servirlo; null si la clave no corresponde a ningún fichero. El
        /// llamador es responsable de cerrar el stream: lo entrega a la respuesta HTTP.
        /// </summary>
        Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken = default);

        /// <summary>
        /// true si la clave pertenece a la tienda indicada. Se comprueba ANTES de abrir para no
        /// servir un fichero de otra tienda aunque alguien adivine su clave.
        /// </summary>
        bool BelongsToStore(string key, Guid tenantId, Guid storeId);
    }

    /// <summary>Contenido que llega por multipart y hay que persistir.</summary>
    public sealed record StoreSyncFileUpload(Stream Content, string FileName, string ContentType, long Length);
}
