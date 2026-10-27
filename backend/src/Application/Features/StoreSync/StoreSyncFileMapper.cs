using Application.Dtos.StoreSync;
using Domain.Entities.StoreSyncFiles;

namespace Application.Features.StoreSync
{
    /// <summary>
    /// Proyección de una fila a su DTO, en UN solo sitio: el alta y la lista tienen que devolver
    /// exactamente la misma forma, o el frontend acabaría con dos modelos para lo mismo.
    /// </summary>
    internal static class StoreSyncFileMapper
    {
        public static StoreSyncFileDto Map(StoreSyncFile file, StoreSyncFileDownload? download) => new()
        {
            Id = file.Id,
            StoreId = file.StoreId,
            StoreName = file.StoreName,
            FileName = file.FileName,
            SizeBytes = file.SizeBytes,
            UploadedByUserId = file.UploadedByUserId,
            UploadedByFullName = file.UploadedByFullName,
            CreatedAt = file.CreatedDate,
            DownloadCount = file.DownloadCount,
            // La marca es informativa: si no existe, el fichero simplemente "no lo ha descargado
            // este usuario todavía" (S4). Nunca se usa para bloquear.
            DownloadedByMe = download is not null,
            DownloadedByMeAt = download?.DownloadedAt,
        };
    }
}
