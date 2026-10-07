using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// API pública de PEDIDOS del catálogo web (F1). Anónima por diseño: el storefront la llama
    /// antes de tener sesión, y lo que necesita saber es si la tienda acepta pedidos y cómo.
    ///
    /// Rutas absolutas (`~/api/v1/public/...`) por el mismo motivo que en `PublicCatalogController`:
    /// cuelga de `/api/v1/public/...` y no del nombre del controlador.
    ///
    /// Lo que sale por aquí es un config acotado. NO incluye el número de WhatsApp — el enlace
    /// `wa.me` se arma en el endpoint del pedido (F4) — ni claves de imagen de la marca, que son
    /// de F8.
    /// </summary>
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PublicOrderingController : BaseApiController
    {
        /// <summary>
        /// Configuración de pedidos de la tienda del slug: si acepta pedidos, modalidades,
        /// envío, mínimo, horarios, zonas y paleta. `404` si no hay catálogo en esa dirección.
        /// </summary>
        [HttpGet("~/api/v1/public/ordering/{storeSlug}/config")]
        [ProducesResponseType(typeof(ResponseResult<PublicOrderingConfigDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetConfigAsync(string storeSlug)
        {
            return Ok(await Sender.Send(new GetPublicOrderingConfigQuery(storeSlug)));
        }
    }
}