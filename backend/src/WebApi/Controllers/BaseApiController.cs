//using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;


namespace WebApiTest.Controllers
{
    /// <summary>
    /// </summary>
    [ApiController]
    [Route("api/v{version:apiVersion}/[controller]")]
    //[Route("api/v1/[controller]")]
    [Produces("application/json")]
    public abstract class BaseApiController : ControllerBase
    {
        //private IMediator _mediator;
        ///// <summary>
        ///// </summary>
        //protected IMediator Mediator => _mediator ??= HttpContext.RequestServices.GetService<IMediator>();
    }
}
