using Application.Abstractions.Storage;
using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage;
using Application.Features.WebCatalog.Showcase.Commands.RemoveStoreCatalogImage;
using Application.Features.WebCatalog.Showcase.Commands.ReorderStoreCatalogImages;
using Application.Features.WebCatalog.Showcase.Queries.GetStoreCatalogImages;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de GESTIÓN del SHOWCASE del catálogo: el carrusel de la cabecera y el bloque de
    /// imágenes del día que el dueño sube desde la vista Catálogo Web (OwnerAdmin).
    ///
    /// Es la MISMA feature que el catálogo —el módulo 18 no crece— y por eso `WebCatalogAdmin`, no
    /// `OnlineOrdersAdmin`: configurar lo que el catálogo muestra es cosa del dueño (D15), igual que
    /// la marca (F8).
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (`~/api/v1/catalog/showcase`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]`, así que sin `~/` cada action quedaría además en
    /// `api/v1/CatalogShowcase/...`.
    ///
    /// NO hay endpoint para actualizar el pie de foto de una imagen que ya está subida: el comando de
    /// alta lleva `Caption` y, si el dueño cambia el texto, quita la imagen y la vuelve a subir. Es
    /// la misma regla que en las imágenes de producto, y evita un PUT que solo toque un texto sobre
    /// una fila que ya existe.
    ///
    /// Este controlador ADMINISTRA las imágenes; las PUBLICA el config anónimo (`PublicOrderingController`)
    /// y las ENTREGA el endpoint de media (`GET /api/v1/public/catalog/{storeSlug}/media/{**key}`), sin
    /// cambios: las claves de showcase comparten el prefijo `{tenant}/{store}/` que ese endpoint valida.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.WebCatalogAdmin)]
    public class CatalogShowcaseController : BaseApiController
    {
        /// <summary>
        /// Las imágenes de la tienda actual, agrupadas por conjunto. Una tienda sin imágenes devuelve
        /// los dos conjuntos VACÍOS — no un 404 — porque recién sincronizada tiene catálogo publicado y
        /// todavía no ha subido ninguna.
        /// </summary>
        [HttpGet("~/api/v1/catalog/showcase")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogImagesDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetImagesAsync()
        {
            return Ok(await Sender.Send(new GetStoreCatalogImagesQuery()));
        }

        /// <summary>
        /// Sube una imagen a UN conjunto (carrusel o imágenes del día). Máximo 10 por conjunto, 2 MB por
        /// archivo y los formatos del catálogo (jpg, png, webp).
        ///
        /// Multipart porque el archivo viaja como `IFormFile`; la capa Application recibe un stream
        /// (`CatalogImageUpload`), igual que las imágenes de producto y que la marca.
        /// </summary>
        [HttpPost("~/api/v1/catalog/showcase")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogImageDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> AddImageAsync([FromForm] StoreCatalogImageKind kind, IFormFile file, [FromForm] string? caption)
        {
            // Si el multipart no trae archivo, el binding deja el `IFormFile` en null: el validador lo
            // rechaza y, si llegara al handler, `CatalogImageUploadRules` devolvería el 400 localizado.
            await using Stream stream = file?.OpenReadStream() ?? Stream.Null;
            return Ok(await Sender.Send(new AddStoreCatalogImageCommand(
                kind, stream, file?.FileName ?? string.Empty, file?.ContentType ?? string.Empty, file?.Length ?? 0, caption)));
        }

        /// <summary>
        /// Quita una imagen: borra la fila y el archivo del disco. Una imagen de otra tienda es un 404
        /// — la pertenencia se resuelve contra la tienda del contexto, no solo contra el tenant.
        /// </summary>
        [HttpDelete("~/api/v1/catalog/showcase/{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> RemoveImageAsync(Guid id)
        {
            return Ok(await Sender.Send(new RemoveStoreCatalogImageCommand(id)));
        }

        /// <summary>
        /// Reordena un conjunto. `orderedIds` es el orden FINAL COMPLETO de ese conjunto, no un
        /// movimiento: tiene que traer exactamente las imágenes que hay ahora, sin repetidas.
        ///
        /// El cuerpo es un request explícito y no el command, como ya hace
        /// `ReorderProductImagesRequest` en `CatalogController`: el contrato del endpoint queda a la
        /// vista en el controlador, y el command sigue siendo el mensaje de MediatR que se valida.
        /// </summary>
        [HttpPut("~/api/v1/catalog/showcase/order")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ReorderAsync([FromBody] ReorderStoreCatalogImagesRequest request)
        {
            return Ok(await Sender.Send(new ReorderStoreCatalogImagesCommand(request.Kind, request.OrderedIds)));
        }
    }

    /// <summary>Cuerpo del reordenado: el conjunto y su orden final completo.</summary>
    public sealed class ReorderStoreCatalogImagesRequest
    {
        /// <summary>Conjunto a reordenar. Un valor fuera del enum se rechaza con 400.</summary>
        public StoreCatalogImageKind Kind { get; set; }

        /// <summary>Orden final: los ids de TODAS las imágenes de ese conjunto, en el orden deseado.</summary>
        public IReadOnlyList<Guid> OrderedIds { get; set; } = [];
    }
}