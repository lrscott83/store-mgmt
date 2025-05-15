using Application.Dtos.Management.StoreUsers;
using Application.Features.Management.StoreUsers.Queries.GetStoreUserById;
using Application.Features.Management.Users.Commands.CreateStoreUser;
using Application.Features.Management.Users.Queries.GetStoreUsers;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [Authorize]
    [HasPermission(StoreRoleFeatures.UsersAdmin)]
    public class StoreUsersController : BaseApiController
    {
        [HttpGet("list/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<StoreUserDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoreUsersAsync(bool includeInactive = true)
        {
            return Ok(await Sender.Send(new GetStoreUsersQuery(includeInactive)));
        }

        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<StoreUserDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStoreUserByIdAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetStoreUserByIdQuery(id)));
        }

        [HttpPost("")]
        [ProducesResponseType(typeof(ResponseResult<StoreUserDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateStoreUserAsync(CreateStoreUserCommand command)
        {
            return Ok(await Sender.Send(command));
        }
    }
}
