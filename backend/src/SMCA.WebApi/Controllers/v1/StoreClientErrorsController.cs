using Application.Dtos.StoreClientErrors;
using Application.Features.StoreClientErrors.Commands.RecordClientErrors;
using Application.Features.StoreClientErrors.Queries.GetClientErrors;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Errores del cliente POS (specs S1-S8 de `pos-client-error-logs`). El POS los acumula en su
    /// buffer local mientras está offline y los envía en lote al recuperar la conexión; el llamador
    /// es fire-and-forget y nunca espera a que se guarden.
    ///
    /// ALTA — AUTENTICADA, SIN `[HasPermission]`: los errores anteriores a una sesión (login
    /// fallido, clave de dispositivo) se bufferizan y se publican DESPUÉS del siguiente login
    /// correcto, así que el llamador siempre existe, pero puede no tener tienda ni feature alguna.
    /// Exigir un permiso aquí perdería justo los errores que más importan.
    ///
    /// LECTURA — SOLO SuperAdmin, con el atributo en la action (el alta sigue abierta a cualquier
    /// usuario autenticado).
    ///
    /// RUTA ABSOLUTA A PROPÓSITO (`~/api/v1/store-client-errors`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]` y una ruta de action sin `~/` se COMBINARÍA con ella,
    /// publicando además `api/v1/StoreClientErrors`.
    ///
    /// `v1` está escrito a mano: un salto de versión de la API debe actualizar este literal (y el
    /// de `GetAsync`), porque la ruta absoluta no pasa por la plantilla del controlador base.
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

        /// <summary>
        /// Lectura filtrada para la pantalla SuperAdmin (specs S6 y S7): owner, tienda y rango de
        /// fechas inclusive sobre `OccurredAt`, paginada (`page` desde 1, `pageSize` máximo 200).
        /// </summary>
        /// <param name="ownerId">Solo los errores de las tiendas de ese owner.</param>
        /// <param name="storeId">Solo los errores de esa tienda.</param>
        /// <param name="from">Cota inferior inclusive de `OccurredAt`, instante absoluto (ISO 8601).</param>
        /// <param name="to">Cota superior inclusive de `OccurredAt`, instante absoluto (ISO 8601).</param>
        /// <param name="page">Página, 1-based. Valores menores se recortan a 1.</param>
        /// <param name="pageSize">Tamaño de página. Valores mayores que 200 se recortan a 200.</param>
        [HttpGet("~/api/v1/store-client-errors")]
        [HasPermission(StoreRoleFeatures.SuperAdmin)]
        [ProducesResponseType(typeof(ResponseResult<StoreClientErrorsPageDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetAsync([FromQuery] Guid? ownerId, [FromQuery] Guid? storeId,
            [FromQuery] DateTime? from, [FromQuery] DateTime? to,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = StoreClientErrorsPageSize.Default)
        {
            return Ok(await Sender.Send(new GetClientErrorsQuery(ownerId, storeId, from, to, page, pageSize)));
        }
    }
}
