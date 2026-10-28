using Application.Abstractions.HttpContext;
using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Alta de pedido del GESTOR de ventas. Es un endpoint separado del público porque la
    /// atribución la pone el servidor (nunca el cuerpo) y porque el gestor no tiene tienda ni
    /// feature por tienda: se autoriza por el rol Owner-level `GestorVentas`.
    ///
    /// La tienda se toma de la ruta y el handler verifica que pertenezca al Owner del gestor y
    /// que tenga el módulo 21 activo. El resto del alta es el MISMO comando público.
    /// </summary>
    [ApiVersion("1.0")]
    [Authorize]
    public class SalesManagerOrdersController : BaseApiController
    {
        private readonly IHttpContextService _httpContextService;

        public SalesManagerOrdersController(IHttpContextService httpContextService)
        {
            _httpContextService = httpContextService;
        }

        [HttpPost("~/api/v1/sales-managers/orders/{storeSlug}")]
        [ProducesResponseType(typeof(ResponseResult<OnlineOrderCreatedDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> CreateAsync(
            string storeSlug,
            [FromBody] CreateOnlineOrderCommand command)
        {
            if (!_httpContextService.IsGestorVentas)
                return Forbid();

            command.StoreSlug = storeSlug;
            command.SalesManagerUserId = _httpContextService.UserExternalId.ToGuid();

            return Ok(await Sender.Send(command));
        }
    }
}
