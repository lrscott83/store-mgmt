using MediatR;
using Microsoft.AspNetCore.Mvc;


namespace WebApiTest.Controllers
{
    /// <summary>
    /// </summary>
    [ApiController]
    //[Route("api/v{version:apiVersion}/[controller]")]
    [Route("api/v1/[controller]")]
    [Produces("application/json")]
    public abstract class BaseApiController : ControllerBase
    {
        private ISender _sender;
        /// <summary>
        /// </summary>
        protected ISender Sender => _sender ??= HttpContext.RequestServices.GetService<ISender>();
    }
}
