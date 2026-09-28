using Application.Dtos.WebCatalog;
using Application.Features.WebCatalog.Public.Queries.GetCatalogMedia;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalog;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProduct;
using Application.Features.WebCatalog.Public.Queries.GetPublicCatalogProducts;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// API pública del catálogo web (plan 2026-09-27). Anónima por diseño: publica solo lo que la
    /// tienda sincronizó. Las rutas usan "~/" porque el catálogo público cuelga de
    /// /api/v1/public/catalog/{slug} y no del nombre del controlador.
    /// </summary>
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PublicCatalogController : BaseApiController
    {
        /// <summary>Cabecera del catálogo publicado: tienda + categorías con sus conteos.</summary>
        [HttpGet("~/api/v1/public/catalog/{storeSlug}")]
        [ProducesResponseType(typeof(ResponseResult<PublicCatalogDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetCatalogAsync(string storeSlug)
        {
            return Ok(await Sender.Send(new GetPublicCatalogQuery(storeSlug)));
        }

        /// <summary>Listado público paginado, con filtro por categoría y búsqueda por nombre.</summary>
        [HttpGet("~/api/v1/public/catalog/{storeSlug}/products")]
        [ProducesResponseType(typeof(ResponseResult<PublicCatalogPageDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetProductsAsync(string storeSlug, [FromQuery] string? categorySlug,
            [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 24)
        {
            return Ok(await Sender.Send(new GetPublicCatalogProductsQuery(storeSlug, categorySlug, search, page, pageSize)));
        }

        /// <summary>Detalle público de un producto (descripción + galería).</summary>
        [HttpGet("~/api/v1/public/catalog/{storeSlug}/products/{productId}")]
        [ProducesResponseType(typeof(ResponseResult<PublicCatalogProductDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetProductAsync(string storeSlug, Guid productId)
        {
            return Ok(await Sender.Send(new GetPublicCatalogProductQuery(storeSlug, productId)));
        }

        /// <summary>Sirve una imagen publicada del catálogo (clave relativa, sin exponer rutas del servidor).</summary>
        [HttpGet("~/api/v1/public/catalog/{storeSlug}/media/{**key}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public async Task<IActionResult> GetMediaAsync(string storeSlug, string key)
        {
            ResponseResult<CatalogMediaFile> result = await Sender.Send(new GetCatalogMediaQuery(storeSlug, key));
            CatalogMediaFile media = result.Data;

            // Cache agresiva: las claves incluyen un guid, así que un archivo nunca cambia de contenido.
            Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            Response.Headers.ContentDisposition = new ContentDispositionHeaderValue("inline").ToString();

            return File(media.Content, media.ContentType);
        }
    }
}
