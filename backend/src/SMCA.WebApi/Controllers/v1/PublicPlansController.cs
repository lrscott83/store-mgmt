using Application.Dtos.Administration.Plans;
using Application.Features.Administration.Plans.Queries.GetPublicPlanPricing;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// API pública de precios de planes para el landing (request del owner 2026-10-15). Anónima por
    /// diseño: publica el catálogo global de planes con los precios reales de la BD, limitado a los
    /// módulos ACTIVOS y DISPONIBLES PARA TIENDA (Gratis/Pago/Superior; VIP nunca es público).
    /// Las rutas usan "~/" porque cuelgan de /api/v1/public/plans y no del nombre del controlador.
    /// </summary>
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PublicPlansController : BaseApiController
    {
        /// <summary>Planes con sus módulos disponibles y precios, para la sección de precios del landing.</summary>
        [HttpGet("~/api/v1/public/plans")]
        [EnableRateLimiting("PublicCatalogPolicy")]
        [ProducesResponseType(typeof(ResponseResult<List<PublicPlanPricingDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetPublicPlansAsync()
        {
            return Ok(await Sender.Send(new GetPublicPlanPricingQuery()));
        }
    }
}
