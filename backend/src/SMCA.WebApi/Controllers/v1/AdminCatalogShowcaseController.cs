using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage;
using Application.Features.WebCatalog.Showcase.Commands.RemoveStoreCatalogImage;
using Application.Features.WebCatalog.Showcase.Commands.ReorderStoreCatalogImages;
using Application.Features.WebCatalog.Showcase.Queries.GetStoreCatalogImages;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// SuperAdmin view of the catalog SHOWCASE, scoped to one store by the route. Same commands as
    /// the owner's <see cref="CatalogShowcaseController"/>; the store comes from
    /// <see cref="AdminStoreScopeAttribute"/> instead of the caller's selected store.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    [AdminStoreScope]
    public class AdminCatalogShowcaseController : BaseApiController
    {
        /// <summary>Las imágenes de la tienda de la ruta, agrupadas por conjunto (siempre las dos listas).</summary>
        [HttpGet("~/api/v1/stores/{storeId:guid}/catalog/showcase")]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogImagesDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetImagesAsync()
        {
            return Ok(await Sender.Send(new GetStoreCatalogImagesQuery()));
        }

        /// <summary>Sube una imagen a UN conjunto (carrusel o imágenes del día).</summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/showcase")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(ProductEntityLimits.MaxImageSizeInBytes + 65536)]
        [ProducesResponseType(typeof(ResponseResult<StoreCatalogImageDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> AddImageAsync([FromForm] StoreCatalogImageKind kind, IFormFile file,
            [FromForm] string? caption)
        {
            await using Stream stream = file?.OpenReadStream() ?? Stream.Null;
            return Ok(await Sender.Send(new AddStoreCatalogImageCommand(
                kind, stream, file?.FileName ?? string.Empty, file?.ContentType ?? string.Empty, file?.Length ?? 0, caption)));
        }

        /// <summary>Quita una imagen: borra la fila y el archivo del disco.</summary>
        [HttpDelete("~/api/v1/stores/{storeId:guid}/catalog/showcase/{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> RemoveImageAsync(Guid id)
        {
            return Ok(await Sender.Send(new RemoveStoreCatalogImageCommand(id)));
        }

        /// <summary>Reordena un conjunto: el orden FINAL COMPLETO de ese conjunto.</summary>
        [HttpPut("~/api/v1/stores/{storeId:guid}/catalog/showcase/order")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> ReorderAsync([FromBody] ReorderStoreCatalogImagesRequest request)
        {
            return Ok(await Sender.Send(new ReorderStoreCatalogImagesCommand(request.Kind, request.OrderedIds)));
        }
    }
}
