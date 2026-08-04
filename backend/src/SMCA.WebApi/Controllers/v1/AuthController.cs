using Application.Dtos.Authentication;
using Application.Features.Authentication.Commands.Login;
using Application.Features.Authentication.Commands.Refresh;
using Application.Features.Authentication.Commands.Register;
using Application.Features.Authentication.Commands.Revoke;
using Application.Features.Authentication.Queries.GetMe;
using Application.Features.Authentication.Queries.Logout;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [Authorize]
    public class AuthController : BaseApiController
    {
        [HttpPost("login")]
        [ProducesResponseType(typeof(AuthDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        [AllowAnonymous]
        [EnableRateLimiting("LoginPolicy")]
        public async Task<IActionResult> AuthAsync([FromBody] LoginCommand command)
        {
            var result = await Sender.Send(command);

            if (result.Succeeded)
                return Ok(result);

            return result.ActionCode switch
            {
                400 => BadRequest(result),     // Validation errors
                401 => Unauthorized(result),   // Invalid credentials
                403 => StatusCode(403, result), // Disabled user/store
                _ => BadRequest(result)
            };
        }

        [HttpPost("refresh")]
        [ProducesResponseType(typeof(ResponseResult<AuthDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status401Unauthorized)]
        [AllowAnonymous]
        public async Task<IActionResult> RefreshAsync([FromBody] RefreshCommand command)
        {
            var result = await Sender.Send(command);
            if (result.Succeeded)
                return Ok(result);

            return Unauthorized(result);
        }

        [HttpPost("revoke")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [Authorize]
        public async Task<IActionResult> RevokeAsync([FromBody] RevokeCommand command)
        {
            await Sender.Send(command);
            return NoContent();
        }

        [HttpGet("logout")]
        [ProducesResponseType(typeof(bool), StatusCodes.Status200OK)]
        [AllowAnonymous]
        public async Task<IActionResult> Logout([FromQuery] LogoutQuery query)
        {
            return Ok(await Sender.Send(query));
        }

        [HttpGet("me")]
        [ProducesResponseType(typeof(ResponseResult<CurrentUserDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetMeAsync()
        {
            var result = await Sender.Send(new GetMeQuery());

            if (result.Succeeded)
                return Ok(result);

            // Asymmetry: /auth/me maps ActionCode to a real HTTP status because failure
            // here means "session over" — a terminated session must not look like a
            // successful fetch. The other 63 actions keep the 200 + envelope convention.
            // 401 stays reachable via the blacklist middleware (JwtBearerOptionsSetup).
            return result.ActionCode switch
            {
                404 => NotFound(result), // GetMeQuery: no external id / user not found / inactive
                _ => NotFound(result)    // ActionCode is int? — null falls to the default arm
            };
        }

        [HttpPost("register")]
        [ProducesResponseType(typeof(ResponseResult<AuthDto>), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
        [ProducesResponseType(typeof(ResponseResult), StatusCodes.Status500InternalServerError)]
        [AllowAnonymous]
        [EnableRateLimiting("RegisterPolicy")]
        public async Task<IActionResult> RegisterAsync([FromBody] RegisterCommand command)
        {
            var result = await Sender.Send(command);

            if (result.Succeeded)
                return Created("/api/v1/auth/me", result);

            return result.ActionCode switch
            {
                400 => BadRequest(result),
                _ => BadRequest(result)
            };
        }

        [HttpGet("ping")]
        [ProducesResponseType(typeof(bool), StatusCodes.Status200OK)]
        [AllowAnonymous]
        public async Task<IActionResult> PingAsync()
        {

            return Ok(true);
        }
    }
}
