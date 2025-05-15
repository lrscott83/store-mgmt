using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
using Application.Features.Authentication.Queries.GetMe;
using Application.Features.Authentication.Queries.Logout;
using Application.ResponseModels;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;

namespace WebApiTest.Controllers.v1
{
    [ApiVersion("1.0")]
    [Authorize]
    public class AuthController : BaseApiController
    {
        [HttpPost("login")]
        [ProducesResponseType(typeof(ResponseResult<AuthDto>), StatusCodes.Status200OK)]
        [AllowAnonymous]
        public async Task<IActionResult> AuthAsync(LoginCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        [HttpGet("logout")]
        [ProducesResponseType(typeof(bool), StatusCodes.Status200OK)]
        public async Task<IActionResult> Logout([FromQuery] LogoutQuery query)
        {
            return Ok(await Sender.Send(query));
        }

        [HttpGet("me")]
        [ProducesResponseType(typeof(ResponseResult<CurrentUserDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetMeAsync()
        {
            return Ok(await Sender.Send(new GetMeQuery()));
        }
    }
}
