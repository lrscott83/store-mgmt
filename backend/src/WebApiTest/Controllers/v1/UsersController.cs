using Application.Dtos.Common;
using Application.Dtos.UserManagement;
using Application.Features.Authentication.Commands.Login;
using Application.Features.UserManagement.Users.Commands.AddUserRoles;
using Application.Features.UserManagement.Users.Commands.CreateUser;
using Application.Features.UserManagement.Users.Commands.DeleteUser;
using Application.Features.UserManagement.Users.Commands.DeleteUserRoles;
using Application.Features.UserManagement.Users.Commands.UpdateUser;
using Application.Features.UserManagement.Users.Queries.GetAllUsers;
using Application.Features.UserManagement.Users.Queries.GetUserById;
using Application.ResponseModels;
using Domain.Common.Attributes;
using Domain.Common.Enums;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace WebApiTest.Controllers.v1
{
    [ApiVersion("1.0")]
    [Authorize]
    [HasFeature(FeatureType.Users)]
    public class UsersController : BaseApiController
    {
        /// <summary>
        /// Get all users
        /// </summary>
        /// <returns></returns>
        [HttpGet("list")]
        [ProducesResponseType(typeof(ResponseResult<List<UserListDto>>), StatusCodes.Status200OK)]
        
        public async Task<IActionResult> GetAllUsersAsync(bool includeInactive)
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
        public async Task<IActionResult> GetUserAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetUserByIdQuery(id)));
        }

        /// <summary>
        /// Add user
        /// </summary>
        /// <returns></returns>
        [HttpPost("CreateUser")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateUserAsync(CreateUserCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Updated user by id
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
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
        public async Task<IActionResult> DeleteUserAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteUserCommand(id)));
        }

        /// <summary>
        /// Add User Roles
        /// </summary>
        /// <returns></returns>
        [HttpPost("AddUserRoles")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<ListViewDto>>), StatusCodes.Status200OK)]
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
        public async Task<IActionResult> RemoveUserRolesAsync(DeleteUserRolesCommand command)
        {
            return Ok(await Sender.Send(command));
        }
    }
}
