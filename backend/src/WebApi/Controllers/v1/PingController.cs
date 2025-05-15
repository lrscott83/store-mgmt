using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace WebApiTest.Controllers.v1
{
    [ApiVersion("1.0")]
    [AllowAnonymous]
    public class PingController : BaseApiController
    {
        [HttpGet(Name = "/")]
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK)]
        public async Task<IActionResult> Ping()
        {
            //var response = await Mediator.Send(command);
            //return Ok(response.Data);
            return Ok("pong");
        }
    }
}
