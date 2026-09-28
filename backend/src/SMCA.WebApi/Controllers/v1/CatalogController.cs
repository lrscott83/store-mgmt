using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Commands.UpdateProductCatalogFields;
using Application.Features.WebCatalog.Images.Commands.AddProductImage;
using Application.Features.WebCatalog.Images.Commands.RemoveProductImage;
using Application.Features.WebCatalog.Images.Commands.ReorderProductImages;
using Application.Features.WebCatalog.Queries.GetCatalogProducts;
using Application.Features.WebCatalog.Queries.GetCatalogStatus;
using Application.Features.WebCatalog.Sync.Commands.SyncCatalog;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de la vista "Catálogo Web" (módulo 18, plan 2026-09-27). El módulo + feature 122
    /// limitan el acceso al Owner de una tienda con el catálogo contratado.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.WebCatalogAdmin)]
    public class CatalogController : BaseApiController
    {
        /// <summary>
        /// Sincroniza el catálogo web: crea lo que falta y actualiza lo existente (relación 1:1 con
        /// el origen). Es el botón "Sincronizar Catálogo".
        ///
        /// Acepta el catálogo LOCAL del POS (offline-first): con snapshot, el servidor espeja esos
        /// productos antes de publicar; sin body, publica el origen que ya tenga el servidor.
        /// </summary>
        [HttpPost("sync")]
        [ProducesResponseType(typeof(ResponseResult<CatalogSyncSummaryDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> SyncCatalogAsync([FromBody] SyncCatalogCommand? request = null)
        {
            return Ok(await Sender.Send(request ?? new SyncCatalogCommand()));
        }

        /// <summary>Estado del catálogo: URL pública, última sincronización y contadores.</summary>
        [HttpGet("status")]
        [ProducesResponseType(typeof(ResponseResult<CatalogStatusDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStatusAsync()
        {
            return Ok(await Sender.Send(new GetCatalogStatusQuery()));
        }

        /// <summary>Productos de la tienda con sus campos de catálogo (lista editable de la vista).</summary>
        [HttpGet("products")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<CatalogProductViewDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetProductsAsync()
        {
            return Ok(await Sender.Send(new GetCatalogProductsQuery()));
        }

        /// <summary>
        /// Guarda los campos del catálogo de un producto: descripción, % de descuento, precio
        /// rebajado, "Nuevo" e imagen principal. Solo esos campos, sin tocar el resto del producto.
        /// </summary>
        [HttpPut("products/{productId}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdateProductAsync(Guid productId,
            [FromBody] UpdateProductCatalogFieldsCommand request)
        {
            request.Id = productId;
            return Ok(await Sender.Send(request));
        }

        /// <summary>Sube una imagen a la galería de un producto (máx. 6 por producto, 2 MB cada una).</summary>
        [HttpPost("products/{productId}/images")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType(typeof(ResponseResult<string>), StatusCodes.Status200OK)]
        public async Task<IActionResult> AddProductImageAsync(Guid productId, IFormFile file)
        {
            // Si el multipart no trae archivo, el binding deja file null y las reglas de
            // CatalogImageUploadRules (length <= 0) devuelven el 400 localizado.
            await using Stream stream = file?.OpenReadStream() ?? Stream.Null;
            return Ok(await Sender.Send(new AddProductImageCommand(
                productId, stream, file?.FileName ?? string.Empty, file?.ContentType ?? string.Empty, file?.Length ?? 0)));
        }

        /// <summary>Quita una imagen de la galería (borra la fila y el archivo).</summary>
        [HttpDelete("products/{productId}/images")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> RemoveProductImageAsync(Guid productId, [FromQuery] string path)
        {
            return Ok(await Sender.Send(new RemoveProductImageCommand(productId, path)));
        }

        /// <summary>Reordena la galería: envía el orden final completo de las imágenes.</summary>
        [HttpPut("products/{productId}/images/order")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ReorderProductImagesAsync(Guid productId, [FromBody] ReorderProductImagesRequest request)
        {
            return Ok(await Sender.Send(new ReorderProductImagesCommand(productId, request.Paths)));
        }
    }

    public sealed class ReorderProductImagesRequest
    {
        public List<string> Paths { get; set; } = new();
    }
}
