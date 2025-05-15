using Application.Features.Test.Queries.GetPong;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PingController : BaseApiController
    {
        private ILogger<AuthController> _logger;
        public PingController(ILogger<AuthController> logger) : base()
        {
            _logger = logger;
        }

        [HttpGet(Name = "ping")]
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK)]
        public async Task<IActionResult> Ping()
        {
            //var response = await Mediator.Send(command);
            //return Ok(response.Data);
            return Ok(await Sender.Send(new GetPongQuery()));
        }
    }
}
