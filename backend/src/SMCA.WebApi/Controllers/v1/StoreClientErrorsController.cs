using Application.Dtos.StoreClientErrors;
using Application.Features.StoreClientErrors.Commands.RecordClientErrors;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Alta de los errores del cliente POS (specs S1-S4 de `pos-client-error-logs`). El POS los
    /// acumula en su buffer local mientras está offline y los envía en lote al recuperar la
    /// conexión; el llamador es fire-and-forget y nunca espera a que se guarden.
    ///
    /// AUTENTICADO, SIN `[HasPermission]`: los errores anteriores a una sesión (login fallido,
    /// clave de dispositivo) se bufferizan y se publican DESPUÉS del siguiente login correcto, así
    /// que el llamador siempre existe, pero puede no tener tienda ni feature alguna. Exigir un
    /// permiso aquí perdería justo los errores que más importan.
    ///
    /// RUTA ABSOLUTA A PROPÓSITO (`~/api/v1/store-client-errors`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]` y una ruta de action sin `~/` se COMBINARÍA con ella,
    /// publicando además `api/v1/StoreClientErrors`.
    /// </summary>
    [ApiVersion("1.0")]
    [Authorize]
    public class StoreClientErrorsController : BaseApiController
    {
        [HttpPost("~/api/v1/store-client-errors")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<IActionResult> RecordAsync([FromBody] RecordClientErrorsRequest request)
        {
            await Sender.Send(new RecordClientErrorsCommand(
                request.StoreId,
                request.Errors ?? []));

            return NoContent();
        }
    }
}
