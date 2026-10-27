using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Admin.Commands.CreateCatalogCategory;
using Application.Features.WebCatalog.Admin.Commands.CreateCatalogProduct;
using Application.Features.WebCatalog.Admin.Queries.GetCatalogCategories;
using Application.Features.WebCatalog.Commands.UpdateProductCatalogFields;
using Application.Features.WebCatalog.Images.Commands.AddProductImage;
using Application.Features.WebCatalog.Images.Commands.RemoveProductImage;
using Application.Features.WebCatalog.Images.Commands.ReorderProductImages;
using Application.Features.WebCatalog.Import.Commands.ImportCatalogCsv;
using Application.Features.WebCatalog.Queries.GetCatalogProducts;
using Application.Features.WebCatalog.Queries.GetCatalogStatus;
using Application.Features.WebCatalog.Sync.Commands.SyncCatalog;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// SuperAdmin view of the "Catálogo Web" configuration (module 18), scoped to ONE store by the
    /// route. Every action sends the SAME command/query the owner endpoints send
    /// (<see cref="CatalogController"/>); the only difference is where the store comes from:
    /// <see cref="AdminStoreScopeAttribute"/> publishes the route's <c>{storeId}</c> as the request's
    /// store context, so a SuperAdmin — who has no selected store — can configure any store without
    /// switching sessions (and without touching the DEK lifecycle).
    ///
    /// Absolute routes on purpose: <see cref="BaseApiController"/> sets
    /// <c>[Route("api/v1/[controller]")]</c>, and the <c>~/</c> prefix replaces it, exactly like
    /// <see cref="CatalogBrandingController"/> and <see cref="CatalogShowcaseController"/> do.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    [AdminStoreScope]
    public class AdminCatalogController : BaseApiController
    {
        /// <summary>
        /// Publica el catálogo de la tienda de la ruta. Sin snapshot: el navegador del SuperAdmin no
        /// tiene el catálogo local del dispositivo de esa tienda, así que se publica el origen que ya
        /// conoce el servidor.
        /// </summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/sync")]
        [ProducesResponseType(typeof(ResponseResult<CatalogSyncSummaryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> SyncCatalogAsync([FromBody] SyncCatalogCommand? request = null)
        {
            return Ok(await Sender.Send(request ?? new SyncCatalogCommand()));
        }

        /// <summary>Estado del catálogo de la tienda: URL pública, última sincronización y contadores.</summary>
        [HttpGet("~/api/v1/stores/{storeId:guid}/catalog/status")]
        [ProducesResponseType(typeof(ResponseResult<CatalogStatusDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetStatusAsync()
        {
            return Ok(await Sender.Send(new GetCatalogStatusQuery()));
        }

        /// <summary>Categorías de la tienda, en el orden en que la vista arma sus paneles.</summary>
        [HttpGet("~/api/v1/stores/{storeId:guid}/catalog/categories")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<CatalogCategoryDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetCategoriesAsync()
        {
            return Ok(await Sender.Send(new GetCatalogCategoriesQuery()));
        }

        /// <summary>Crea una categoría del catálogo de la tienda de la ruta (orden al final por defecto).</summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/categories")]
        [ProducesResponseType(typeof(ResponseResult<CatalogCategoryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> CreateCategoryAsync([FromBody] CreateCatalogCategoryCommand request)
        {
            return Ok(await Sender.Send(request));
        }

        /// <summary>
        /// Crea un producto del catálogo en una categoría de la tienda de la ruta. Es un producto
        /// real de la tienda (en venta), sin depender de una sincronización.
        /// </summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/products")]
        [ProducesResponseType(typeof(ResponseResult<CreatedCatalogProductDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> CreateProductAsync([FromBody] CreateCatalogProductCommand request)
        {
            return Ok(await Sender.Send(request));
        }

        /// <summary>Productos de la tienda con sus campos de catálogo (lista editable).</summary>
        [HttpGet("~/api/v1/stores/{storeId:guid}/catalog/products")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<CatalogProductViewDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetProductsAsync()
        {
            return Ok(await Sender.Send(new GetCatalogProductsQuery()));
        }

        /// <summary>Guarda los campos de catálogo de un producto (solo esos campos).</summary>
        [HttpPut("~/api/v1/stores/{storeId:guid}/catalog/products/{productId}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> UpdateProductAsync(Guid productId,
            [FromBody] UpdateProductCatalogFieldsCommand request)
        {
            request.Id = productId;
            return Ok(await Sender.Send(request));
        }

        /// <summary>Sube una imagen a la galería de un producto (máx. 6 por producto, 2 MB cada una).</summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/products/{productId}/images")]
        [Consumes("multipart/form-data")]
        [RequestSizeLimit(ProductEntityLimits.MaxImageSizeInBytes + 65536)]
        [ProducesResponseType(typeof(ResponseResult<string>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> AddProductImageAsync(Guid productId, IFormFile file)
        {
            await using Stream stream = file?.OpenReadStream() ?? Stream.Null;
            return Ok(await Sender.Send(new AddProductImageCommand(
                productId, stream, file?.FileName ?? string.Empty, file?.ContentType ?? string.Empty, file?.Length ?? 0)));
        }

        /// <summary>Quita una imagen de la galería (borra la fila y el archivo).</summary>
        [HttpDelete("~/api/v1/stores/{storeId:guid}/catalog/products/{productId}/images")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> RemoveProductImageAsync(Guid productId, [FromQuery] string path)
        {
            return Ok(await Sender.Send(new RemoveProductImageCommand(productId, path)));
        }

        /// <summary>
        /// Importa productos al catálogo de la tienda desde un CSV ya parseado por el navegador
        /// (categoría, producto, precio de venta y moneda). Es un UPSERT por categoría + producto:
        /// crea lo que falta y actualiza precio y moneda de lo existente. Todo o nada.
        /// </summary>
        [HttpPost("~/api/v1/stores/{storeId:guid}/catalog/import")]
        [ProducesResponseType(typeof(ResponseResult<CatalogCsvImportSummaryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> ImportCsvAsync([FromBody] ImportCatalogCsvCommand request)
        {
            return Ok(await Sender.Send(request));
        }

        /// <summary>Reordena la galería: envía el orden final completo de las imágenes.</summary>
        [HttpPut("~/api/v1/stores/{storeId:guid}/catalog/products/{productId}/images/order")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> ReorderProductImagesAsync(Guid productId,
            [FromBody] ReorderProductImagesRequest request)
        {
            return Ok(await Sender.Send(new ReorderProductImagesCommand(productId, request.Paths)));
        }
    }
}
