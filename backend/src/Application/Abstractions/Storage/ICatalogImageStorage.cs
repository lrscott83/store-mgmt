namespace Application.Abstractions.Storage
{
    /// <summary>
    /// Almacenamiento de las imágenes del catálogo web (decisión D3, plan 2026-09-27), de la MARCA
    /// de la tienda (F8: logo y banner) y del SHOWCASE (carrusel e imágenes del día).
    ///
    /// La clave (<c>key</c>) es relativa y estable, y es lo ÚNICO que se persiste en la base de
    /// datos: las rutas absolutas del servidor nunca salen del almacenamiento. Hay tres formas:
    ///
    ///   * Imagen de producto: <c>{tenantId}/{storeId}/{productId}/{guid}{ext}</c>.
    ///   * Imagen de MARCA: <c>{tenantId}/{storeId}/branding/{kind}/{guid}{ext}</c>.
    ///   * Imagen de SHOWCASE: <c>{tenantId}/{storeId}/catalog/{kind}/{guid}{ext}</c>.
    ///
    /// Las tres comparten el prefijo <c>{tenantId}/{storeId}/</c> a propósito: es lo que
    /// <see cref="BelongsToStore"/> valida, así que el MISMO endpoint público
    /// (<c>GET /api/v1/public/catalog/{storeSlug}/media/{**key}</c>) sirve el logo, el banner, el
    /// carrusel y las imágenes del día sin un caso nuevo. Ni la marca ni el showcase introducen un
    /// almacén paralelo.
    /// </summary>
    public interface ICatalogImageStorage
    {
        /// <summary>Guarda la imagen y devuelve la clave relativa que se persiste.</summary>
        Task<string> SaveAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, Guid productId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Guarda una imagen de MARCA (F8) y devuelve su clave. A diferencia de
        /// <see cref="SaveAsync"/> no hay producto: el archivo pertenece a la tienda, y la carpeta
        /// <c>branding</c> con el <paramref name="kind"/> ("logo", "banner") es lo que lo separa de
        /// las imágenes de producto.
        ///
        /// <paramref name="kind"/> va dentro de la ruta, así que se sanea antes de escribir: no
        /// puede traer separadores ni abrir carpetas.
        /// </summary>
        Task<string> SaveBrandingAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, string kind,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Guarda una imagen de SHOWCASE (carrusel o imágenes del día) y devuelve su clave. Igual que
        /// la marca, no hay producto: el archivo pertenece a la tienda. La carpeta
        /// <c>catalog</c> con el <paramref name="kind"/> ("carousel", "daily") es lo que lo separa de
        /// las de producto y de las de marca.
        ///
        /// <paramref name="kind"/> va dentro de la ruta, así que se sanea antes de escribir: no
        /// puede traer separadores ni abrir carpetas.
        /// </summary>
        Task<string> SaveCatalogImageAsync(CatalogImageUpload upload, Guid tenantId, Guid storeId, string kind,
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
