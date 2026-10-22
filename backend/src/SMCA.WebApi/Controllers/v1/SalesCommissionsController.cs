using Application.Features.SalesManagers.Commands.MarkSalesCommissionPaid;
using Application.ResponseModels;
using Asp.Versioning;
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
