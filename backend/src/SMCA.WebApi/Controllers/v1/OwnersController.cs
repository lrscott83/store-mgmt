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
        /// Get all owners
        /// </summary>
        /// <param name="includeInactive">Whether to include inactive owners</param>
        /// <returns></returns>
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<OwnerDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetAllOwnersAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllOwnersQuery(includeInactive)));
        }

        /// <summary>
        /// Get owner by id
        /// </summary>
        /// <param name="id">Owner Id</param>
        /// <returns></returns>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetOwnerAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetOwnerByIdQuery(id)));
        }

        /// <summary>
        /// Create a new owner
        /// </summary>
        /// <param name="command">The create-owner command with login, password, full name, cellphone and optional ReSellerId, email and description</param>
        /// <returns>A 201 Created response with a ResponseResult envelope carrying the created OwnerDto, or an error envelope</returns>
        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> CreateOwnerAsync(CreateOwnerCommand command)
        {
            var result = await Sender.Send(command);
            return result.Succeeded
                ? CreatedAtAction("GetOwner", new { id = result.Data!.Id }, result)
                : Ok(result);
        }

        /// <summary>
        /// Updates an owner by id
        /// </summary>
        /// <param name="id">Owner Id</param>
        /// <param name="command">The update-owner command with full name, cellphone and optional ReSellerId, email and description</param>
        /// <returns>A 200 OK response with a ResponseResult envelope carrying the updated OwnerDto, or an error envelope</returns>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> UpdatedAsync([FromRoute] Guid id, [FromBody] UpdateOwnerCommand command)
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
