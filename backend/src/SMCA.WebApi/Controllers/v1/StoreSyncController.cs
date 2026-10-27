using Application.Dtos.StoreSync;
using Application.Features.StoreSync.Commands.DeleteStoreSyncFile;
using Application.Features.StoreSync.Commands.UploadStoreSyncFile;
using Application.Features.StoreSync.Queries.DownloadStoreSyncFile;
using Application.Features.StoreSync.Queries.GetStoreSyncFiles;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Repositorio de ficheros de sincronización del POS: los ZIP cifrados que el POS ya exporta,
    /// guardados en el servidor para que el Owner y sus StoreUsers los compartan sin pasar por el
    /// disco (S1, S3, S13).
    ///
    /// El backend es un ALMACÉN: guarda los bytes opacos y la metadata (tienda, fecha, quién lo
    /// subió, cuántas descargas). Nunca inspecciona el ZIP, nunca lo descifra y nunca ve la
    /// contraseña.
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (<c>~/api/v1/sync/files</c>): <see cref="BaseApiController"/> fija
    /// <c>[Route("api/v1/[controller]")]</c>, así que sin <c>~/</c> cada action quedaría además en
    /// <c>api/v1/StoreSync/...</c>.
    ///
    /// El GATE va por acción (S9) y no en la clase: subir y descargar son features distintas, y
    /// listar y borrar aceptan cualquiera de las dos.
    /// </summary>
    [ApiVersion("1.0")]
    public class StoreSyncController : BaseApiController
    {
        /// <summary>
        /// Sube UN fichero de UNA tienda. Multipart porque el archivo viaja como <c>IFormFile</c>;
        /// la capa Application recibe un stream, igual que las imágenes del catálogo.
        ///
        /// El límite del request deja 64 KB de margen sobre el fichero: el multipart lleva
        /// cabeceras y delimitadores que también cuentan, y sin margen un ZIP de exactamente 50 MB
        /// se rechazaría por el tamaño del SOBRE en vez de por el del fichero.
        ///
        /// <c>RequestFormLimits</c> es imprescindible: `Program.cs` fija el
        /// <c>MultipartBodyLengthLimit</c> global en 8 MB (pensado para imágenes), así que sin este
        /// override el parser rechazaría el ZIP de 50 MB con un 400 ANTES de llegar al handler y la
        /// regla de S10 —413 para más de 50 MB— nunca se ejecutaría.
        /// </summary>
        [HttpPost("~/api/v1/sync/files")]
        [HasPermission(StoreRoleFeatures.SendAdmin)]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(StoreSyncFileLimits.MaxFileSizeInBytes + 65536)]
        [RequestFormLimits(MultipartBodyLengthLimit = StoreSyncFileLimits.MaxFileSizeInBytes + 65536)]
        [ProducesResponseType(typeof(ResponseResult<StoreSyncFileDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UploadAsync([FromForm] Guid storeId, IFormFile file)
        {
            // Si el multipart no trae archivo, el binding deja el `IFormFile` en null: se envía un
            // stream vacío con longitud 0 y el handler lo rechaza con el 400 localizado (S10).
            await using Stream stream = file?.OpenReadStream() ?? Stream.Null;
            return Ok(await Sender.Send(new UploadStoreSyncFileCommand(
                storeId,
                stream,
                file?.FileName ?? string.Empty,
                file?.ContentType ?? string.Empty,
                file?.Length ?? 0)));
        }

        /// <summary>
        /// Los ficheros visibles para el llamador, del más reciente al más antiguo (S3, S5): el
        /// Owner ve los de todas sus tiendas y el StoreUser solo los de la suya.
        /// </summary>
        [HttpGet("~/api/v1/sync/files")]
        [HasPermission(StoreRoleFeatures.SendAdmin, StoreRoleFeatures.ReceiveAdmin)]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<StoreSyncFileDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFilesAsync()
        {
            return Ok(await Sender.Send(new GetStoreSyncFilesQuery()));
        }

        /// <summary>
        /// Descarga el fichero tal cual se subió (S4, S7). Como efecto lateral registra la marca
        /// del usuario y suma uno al contador, en la misma transacción.
        ///
        /// Se sirve SIEMPRE como <c>application/zip</c> con el nombre original: el backend no
        /// interpreta el contenido.
        /// </summary>
        [HttpGet("~/api/v1/sync/files/{id:guid}/content")]
        [HasPermission(StoreRoleFeatures.ReceiveAdmin)]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> DownloadAsync(Guid id)
        {
            var result = await Sender.Send(new DownloadStoreSyncFileQuery(id));
            StoreSyncFileContent content = result.Data;
            return File(content.Content, StoreSyncFileLimits.ContentType, content.FileName);
        }

        /// <summary>
        /// Borra un fichero de una tienda del llamador (S8): da de baja la fila y borra el blob.
        /// Un fichero de otra tienda responde 404, igual que uno inexistente.
        /// </summary>
        [HttpDelete("~/api/v1/sync/files/{id:guid}")]
        [HasPermission(StoreRoleFeatures.SendAdmin, StoreRoleFeatures.ReceiveAdmin)]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteStoreSyncFileCommand(id)));
        }
    }
}
