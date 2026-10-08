using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderStatus;
using Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderingConfig;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

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

        /// <summary>
        /// Crea el pedido online del cliente anónimo (F3, T5/T7). Es la UNICA escritura pública
        /// del backend, y por eso lleva su propio límite de tasa
        /// (`OnlineOrderPolicy`: 20 pedidos / 10 min por IP + slug): sin él, un script llenaría la
        /// tabla de pedidos de una tienda con basura que el dueño tendría que cancelar una a una.
        ///
        /// El `storeSlug` de la RUTA se copia al comando y el cuerpo NO puede sobreescribirlo: es
        /// el cuerpo lo que controla el cliente, y el slug es lo que decide en qué tienda y con qué
        /// configuración se crea el pedido. Aceptarlo del body dejaría pedir en una tienda ajena.
        ///
        /// El total, la moneda y el precio de cada línea NO vienen del cliente: los calcula el
        /// handler leyendo el catálogo (F2), así que un precio manipulado no cambia nada.
        /// </summary>
        [HttpPost("~/api/v1/public/ordering/{storeSlug}/orders")]
        [EnableRateLimiting("OnlineOrderPolicy")]
        [ProducesResponseType(typeof(ResponseResult<OnlineOrderCreatedDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        public async Task<IActionResult> CreateOrderAsync(string storeSlug, [FromBody] CreateOnlineOrderCommand request)
        {
            request.StoreSlug = storeSlug;
            return Ok(await Sender.Send(request));
        }

        /// <summary>
        /// Estado de un pedido por código y teléfono (F3, T6). Anónimo por diseño: es la vía de
        /// autoservicio de quien pidió, sin cuenta ni login (D4).
        ///
        /// El `404` es UNIFORME a propósito —código inexistente, código de otra tienda y teléfono que
        /// no coincide responden igual— para que el endpoint no sirva de oráculo de qué códigos
        /// existen. El `phone` va en la query, no en el cuerpo: es una lectura y pertenece a la URL.
        /// </summary>
        [HttpGet("~/api/v1/public/ordering/{storeSlug}/orders/{code}")]
        [ProducesResponseType(typeof(ResponseResult<PublicOrderStatusDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetOrderStatusAsync(string storeSlug, string code, [FromQuery] string? phone)
        {
            return Ok(await Sender.Send(new GetPublicOrderStatusQuery(storeSlug, code, phone ?? string.Empty)));
        }
    }
}