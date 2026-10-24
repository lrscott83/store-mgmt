using Application.Dtos.SalesManagers;
using Application.Features.SalesManagers.Commands.CreateSalesManager;
using Application.Features.SalesManagers.Commands.SetSalesManagerActive;
using Application.Features.SalesManagers.Queries.GetSalesManagers;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Gestores de ventas del Owner (rol 5). Owner-only y gateado por el módulo 21.
    /// El gestor NO es StoreUser ni ReSeller: es una cuenta Owner-level.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.GestoresVentasAdmin)]
    public class SalesManagersController : BaseApiController
    {
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<SalesManagerDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetAllAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetSalesManagersQuery(includeInactive)));
        }

        [HttpPost]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateAsync([FromBody] CreateSalesManagerCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpPut("{id}/active")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> SetActiveAsync(Guid id, [FromBody] SetSalesManagerActiveRequest request)
        {
            return Ok(await Sender.Send(new SetSalesManagerActiveCommand(id, request.IsActive)));
        }
    }

    public sealed record SetSalesManagerActiveRequest(bool IsActive);
}
