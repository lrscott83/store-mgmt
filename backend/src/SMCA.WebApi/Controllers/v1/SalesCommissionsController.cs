using Application.Dtos.SalesManagers;
using Application.Features.SalesManagers.Commands.MarkSalesCommissionPaid;
using Application.Features.SalesManagers.Queries.GetOwnerSalesCommissions;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Acciones del Owner sobre las comisiones de sus gestores. El handler exige OwnerAdmin y
    /// verifica que la comisión pertenezca a su Owner; la autorización no vive en el frontend.
    /// </summary>
    [ApiVersion("1.0")]
    [Authorize]
    public class SalesCommissionsController : BaseApiController
    {
        /// <summary>
        /// Listado de cobros del Owner. NO se gatea por el módulo 21 a propósito (S10): al
        /// desactivar el módulo, las comisiones ya generadas y pendientes siguen siendo pagables,
        /// así que el Owner tiene que poder verlas para pagarlas. La frontera real es OwnerAdmin +
        /// Owner activo (la valida el handler), no la feature.
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(ResponseResult<List<OwnerSalesCommissionDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetAsync(
            [FromQuery] SalesCommissionStatus? status,
            [FromQuery] Guid? salesManagerId)
        {
            return Ok(await Sender.Send(
                new GetOwnerSalesCommissionsQuery(status, salesManagerId)));
        }

        [HttpPost("{id}/pay")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        public async Task<IActionResult> PayAsync(
            Guid id,
            [FromBody] MarkSalesCommissionPaidRequest request)
        {
            return Ok(await Sender.Send(new MarkSalesCommissionPaidCommand(id, request.Note)));
        }
    }

    public sealed record MarkSalesCommissionPaidRequest(string? Note);
}
