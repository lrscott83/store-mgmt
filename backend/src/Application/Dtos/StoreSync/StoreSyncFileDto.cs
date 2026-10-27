namespace Application.Dtos.StoreSync
{
    /// <summary>
    /// Un fichero del repositorio de sincronización del POS tal como lo ve la pantalla (S3, S4).
    ///
    /// <see cref="StoreName"/> y <see cref="UploadedByFullName"/> son las FOTOGRAFÍAS guardadas en
    /// el alta, no joins: la lista tiene que seguir diciendo quién subió qué aunque después se
    /// renombre la tienda o el usuario cambie su nombre.
    ///
    /// <see cref="DownloadedByMe"/> / <see cref="DownloadedByMeAt"/> son INFORMATIVOS (S4): no
    /// ocultan el fichero ni bloquean una segunda descarga. El contador
    /// (<see cref="DownloadCount"/>) es global del fichero; la marca es por usuario.
    /// </summary>
    public sealed class StoreSyncFileDto
    {
        public Guid Id { get; set; }

        /// <summary>Tienda a la que pertenece el fichero (S1).</summary>
        public Guid StoreId { get; set; }

        /// <summary>Nombre de la tienda, congelado en el alta.</summary>
        public string StoreName { get; set; } = string.Empty;

        /// <summary>Nombre ORIGINAL del fichero, tal como lo generó el POS.</summary>
        public string FileName { get; set; } = string.Empty;

        public long SizeBytes { get; set; }

        public Guid UploadedByUserId { get; set; }

        /// <summary>Nombre completo de quien subió el fichero, congelado en el alta.</summary>
        public string UploadedByFullName { get; set; } = string.Empty;

        /// <summary>Fecha de subida. La lista va de la más reciente a la más antigua (S3).</summary>
        public DateTimeOffset CreatedAt { get; set; }

        /// <summary>Descargas acumuladas del fichero. Informativo.</summary>
        public int DownloadCount { get; set; }

        /// <summary>true si el USUARIO de la petición ya descargó este fichero alguna vez.</summary>
        public bool DownloadedByMe { get; set; }

        /// <summary>Fecha de la primera descarga de ese usuario; null si aún no lo descargó.</summary>
        public DateTimeOffset? DownloadedByMeAt { get; set; }
    }
}
