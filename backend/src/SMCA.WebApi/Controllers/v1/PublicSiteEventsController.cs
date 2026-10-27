using Application.Features.SiteTelemetry.Commands.RecordSitePageViews;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Beacon anónimo de las páginas públicas del sitio (landing, login, register y legales).
    /// El cliente lo llama fire-and-forget: el visitante nunca espera a que se registre nada.
    ///
    /// Es pública por diseño y por eso:
    ///   * el servidor valida el path contra una lista CERRADA (`SiteEventCatalog`) y calcula las
    ///     huellas; el cliente no decide qué se guarda;
    ///   * un path desconocido o un bot responden 204 sin escribir;
    ///   * usa el mismo límite de tasa que el catálogo público (`PublicCatalogPolicy`).
    ///
    /// El manual de usuario NO pasa por aquí: son archivos estáticos que se cuentan en el
    /// servidor (`ManualViewTelemetryMiddleware`).
    /// </summary>
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PublicSiteEventsController : BaseApiController
    {
        [HttpPost("~/api/v1/public/site/events")]
        [EnableRateLimiting("PublicCatalogPolicy")]
        [RequestSizeLimit(16_384)]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        public async Task<IActionResult> RecordAsync([FromBody] RecordSitePageViewsRequest request)
        {
            await Sender.Send(new RecordSitePageViewsCommand(
                Request.Headers.UserAgent.ToString(),
                request.Events ?? []));

            return NoContent();
        }
    }
}
