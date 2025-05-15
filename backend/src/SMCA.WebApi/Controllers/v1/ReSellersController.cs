using Application.Dtos.Administration.ReSellers;
using Application.Features.Administration.ReSellers.Commands.CreateReSeller;
using Application.Features.Administration.ReSellers.Commands.DeleteReSeller;
using Application.Features.Administration.ReSellers.Commands.UpdateReSeller;
using Application.Features.Administration.ReSellers.Queries.GetAllReSellers;
using Application.Features.Administration.ReSellers.Queries.GetReSellerById;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.SuperAdmin)]
    public class ReSellersController : BaseApiController
    {
        /// <summary>
        /// Get all ReSellers
        /// </summary>
        /// <returns></returns>
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<ReSellerDto>>), StatusCodes.Status200OK)]
        
        public async Task<IActionResult> GetAllReSellersAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllReSellersQuery(includeInactive)));
        }

        /// <summary>
        /// Get ReSeller by id
        /// </summary>
        /// <param name="id">ReSeller Id</param>
        /// <returns></returns>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<ReSellerDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetReSellerAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetReSellerByIdQuery(id)));
        }

        /// <summary>
        /// Add ReSeller
        /// </summary>
        /// <returns></returns>
        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateReSellerAsync(CreateReSellerCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Updated ReSeller by id
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatedAsync(Guid id, [FromBody] UpdateReSellerCommand command)
        {
            command.Id = id;
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Delete ReSeller by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteReSellerAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteReSellerCommand(id)));
        }
    }
}
