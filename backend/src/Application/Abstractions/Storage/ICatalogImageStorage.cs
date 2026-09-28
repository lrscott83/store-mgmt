namespace Application.Abstractions.Storage
{
    /// <summary>
    /// Almacenamiento de las imágenes del catálogo web (decisión D3, plan 2026-09-27).
    ///
    /// La clave (<c>key</c>) es relativa y estable con la forma
    /// <c>{tenantId}/{storeId}/{productId}/{guid}{ext}</c> y es lo ÚNICO que se persiste en la
    /// base de datos: las rutas absolutas del servidor nunca salen del almacenamiento.
    /// </summary>
    public interface ICatalogImageStorage
    {
        /// <summary>Guarda la imagen y devuelve la clave relativa que se persiste.</summary>
        Task<string> SaveAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, Guid productId,
            CancellationToken cancellationToken = default);

        /// <summary>Borra el archivo de una clave. No falla si el archivo ya no existe.</summary>
        Task DeleteAsync(string key, CancellationToken cancellationToken = default);

        /// <summary>Abre la imagen para servirla; null si la clave no corresponde a ningún archivo.</summary>
        Task<CatalogStoredImage?> OpenAsync(string key, CancellationToken cancellationToken = default);

        /// <summary>
        /// true si la clave pertenece a la tienda indicada. El endpoint público lo usa para no
        /// servir imágenes de otras tiendas aunque alguien adivine una clave.
        /// </summary>
        bool BelongsToStore(string key, Guid tenantId, Guid storeId);
    }

    /// <summary>Contenido que llega por multipart y hay que persistir.</summary>
    public sealed record CatalogImageUpload(Stream Content, string FileName, string ContentType, long Length);

    /// <summary>Imagen lista para servir por HTTP.</summary>
    public sealed record CatalogStoredImage(Stream Content, string ContentType, long Length);
}
