using Application.Dtos.Administration.Owners;
using Application.Features.Administration.Owners.Commands.CreateOwner;
using Application.Features.Administration.Owners.Commands.DeleteOwner;
using Application.Features.Administration.Owners.Commands.UpdateOwner;
using Application.Features.Administration.Owners.Queries.GetAllOwners;
using Application.Features.Administration.Owners.Queries.GetOwnerById;
using Application.Features.Authentication.Commands.Login;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.OwnersAdmin)]
    public class OwnersController : BaseApiController
    {
        /// <summary>
        /// Get all users
        /// </summary>
        /// <returns></returns>
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<OwnerDto>>), StatusCodes.Status200OK)]
        
        public async Task<IActionResult> GetAllOwnersAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllOwnersQuery(includeInactive)));
        }

        /// <summary>
        /// Get user by id
        /// </summary>
        /// <param name="id">Owner Id</param>
        /// <returns></returns>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetOwnerAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetOwnerByIdQuery(id)));
        }

        /// <summary>
        /// Add user
        /// </summary>
        /// <returns></returns>
        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateOwnerAsync(CreateOwnerCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Updated user by id
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatedAsync(Guid id, [FromBody] UpdateOwnerCommand command)
        {
            command.Id = id;
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Delete user by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteOwnerAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteOwnerCommand(id)));
        }
    }
}
