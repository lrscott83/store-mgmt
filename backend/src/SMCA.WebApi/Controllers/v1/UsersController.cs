using Application.Dtos.Common;
using Application.Dtos.UserManagement;
using Application.Features.Management.Users.Commands.ActivateUser;
using Application.Features.UserManagement.Users.Commands.AddUserRoles;
using Application.Features.UserManagement.Users.Commands.DeleteUser;
using Application.Features.UserManagement.Users.Commands.DeleteUserRoles;
using Application.Features.UserManagement.Users.Commands.UpdateUser;
using Application.Features.UserManagement.Users.Commands.UpdateUserPassword;
using Application.Features.UserManagement.Users.Queries.GetAllUsers;
using Application.Features.UserManagement.Users.Queries.GetUserById;
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
    public class UsersController : BaseApiController
    {
        /// <summary>
        /// Get all users
        /// </summary>
        /// <returns></returns>
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<UserListDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]

        public async Task<IActionResult> GetAllUsersAsync([FromRoute] bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllUsersQuery(includeInactive)));
        }

        /// <summary>
        /// Get user by id
        /// </summary>
        /// <param name="id">User Id</param>
        /// <returns></returns>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<UserDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]
        public async Task<IActionResult> GetUserAsync([FromRoute] Guid id)
        {
            return Ok(await Sender.Send(new GetUserByIdQuery(id)));
        }

        /// <summary>
        /// Updated user by id
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.ProfileAdmin)]
        public async Task<IActionResult> UpdatedAsync(Guid id, [FromBody] UpdateUserCommand command)
        {
            command.Id = id;
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Delete user by id
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]
        public async Task<IActionResult> DeleteUserAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteUserCommand(id)));
        }

        /// <summary>
        /// Activate user by id
        /// </summary>
        [HttpPost("activate")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]
        public async Task<IActionResult> ActivateUserAsync([FromBody] ActivateUserCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Add User Roles
        /// </summary>
        /// <returns></returns>
        [HttpPost("AddUserRoles")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<ListViewDto>>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]
        public async Task<IActionResult> AddUserRolesAsync(AddUserRolesCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Delete User Roles
        /// </summary>
        /// <returns></returns>
        [HttpPost("DeleteUserRoles")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<ListViewDto>>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.UsersAdmin)]
        public async Task<IActionResult> RemoveUserRolesAsync(DeleteUserRolesCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Delete User Roles
        /// </summary>
        /// <returns></returns>
        [HttpPost("change-password")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [HasPermission(StoreRoleFeatures.ProfileAdmin)]
        public async Task<IActionResult> ChangePasswordAsync(UpdateUserPasswordCommand command)
        {
            return Ok(await Sender.Send(command));
        }
    }
}
