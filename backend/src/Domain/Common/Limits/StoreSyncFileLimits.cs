namespace Domain.Common.Limits
{
    /// <summary>
    /// Límites del repositorio de ficheros de sincronización del POS: los ZIP cifrados que el
    /// Owner y los StoreUsers suben al servidor (S10, S13).
    ///
    /// Viven en el Domain —y no en la capa de infraestructura— para que la validación de la API,
    /// las longitudes de columna de EF y los tests informen EXACTAMENTE lo mismo. Es el mismo
    /// criterio que <see cref="ProductEntityLimits"/>.
    ///
    /// El límite de tamaño se expresa en <c>long</c>: 50 MB no cabe en un <c>int</c> si algún día
    /// se sube, y el tamaño que llega por multipart ya es <c>long</c>.
    /// </summary>
    public static class StoreSyncFileLimits
    {
        /// <summary>Tamaño máximo por fichero: 50 MB (S10). Por encima se responde 413.</summary>
        public const long MaxFileSizeInBytes = 50L * 1024 * 1024;

        /// <summary>Longitud máxima del nombre original del fichero (se conserva tal cual, S3).</summary>
        public const int FileNameMaxLength = 260;

        /// <summary>Longitud máxima del content type declarado por el cliente.</summary>
        public const int ContentTypeMaxLength = 128;

        /// <summary>Longitud máxima de la clave relativa del blob en disco.</summary>
        public const int StorageKeyMaxLength = 512;

        /// <summary>Longitud máxima del nombre completo del usuario que subió el fichero.</summary>
        public const int FullNameMaxLength = 200;

        /// <summary>Longitud máxima del nombre de la tienda, congelado en el alta.</summary>
        public const int StoreNameMaxLength = 200;

        /// <summary>Content type con el que se sirve el fichero: el ZIP se descarga, no se interpreta.</summary>
        public const string ContentType = "application/zip";
    }
}
