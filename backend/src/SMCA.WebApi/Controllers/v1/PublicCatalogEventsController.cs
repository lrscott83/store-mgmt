using Application.Features.WebCatalog.Public.Commands.RecordCatalogEvents;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Beacon anónimo de la telemetría del catálogo público. El storefront lo llama con
    /// `sendBeacon`/fire-and-forget: el visitante nunca espera a que se registre nada.
    ///
    /// Es pública por diseño (el catálogo lo es), y por eso:
    ///   * el servidor calcula las huellas y clasifica el origen; el cliente no decide nada;
    ///   * un slug desconocido o un bot responden 204 sin escribir;
    ///   * el límite de tasa es el mismo del catálogo (`PublicCatalogPolicy`).
    /// </summary>
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PublicCatalogEventsController : BaseApiController
    {
        [HttpPost("~/api/v1/public/catalog/{storeSlug}/events")]
        [EnableRateLimiting("PublicCatalogPolicy")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        public async Task<IActionResult> RecordAsync(string storeSlug,
            [FromBody] RecordCatalogEventsRequest request)
        {
            await Sender.Send(new RecordCatalogEventsCommand(
                storeSlug,
                Request.Headers.UserAgent.ToString(),
                request.Events ?? []));

            return NoContent();
        }
    }
}
