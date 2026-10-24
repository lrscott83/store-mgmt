using Application.Abstractions.HttpContext;
using Application.Dtos.SalesManagers;
using Application.Features.SalesManagers.Queries.GetMySalesManagerCommissions;
using Application.Features.SalesManagers.Queries.GetMySalesManagerOrders;
using Application.Features.SalesManagers.Queries.GetMySalesManagerStores;
using Application.ResponseModels;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Vista del GESTOR de ventas (S3): sus pedidos, sus comisiones y los catálogos web de las
    /// tiendas de su Owner. Separada del panel del POS porque el gestor no tiene tienda ni
    /// features por tienda: se autoriza por el rol Owner-level `GestorVentas`.
    /// </summary>
    [ApiVersion("1.0")]
    [Authorize]
    public class SalesManagerPortalController : BaseApiController
    {
        private readonly IHttpContextService _httpContextService;

        public SalesManagerPortalController(IHttpContextService httpContextService)
        {
            _httpContextService = httpContextService;
        }

        [HttpGet("~/api/v1/sales-managers/orders")]
        [ProducesResponseType(typeof(ResponseResult<List<SalesManagerOrderDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetMyOrdersAsync()
        {
            if (!_httpContextService.IsGestorVentas)
                return Forbid();

            return Ok(await Sender.Send(new GetMySalesManagerOrdersQuery()));
        }

        [HttpGet("~/api/v1/sales-managers/commissions")]
        [ProducesResponseType(typeof(ResponseResult<List<SalesManagerCommissionDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetMyCommissionsAsync()
        {
            if (!_httpContextService.IsGestorVentas)
                return Forbid();

            return Ok(await Sender.Send(new GetMySalesManagerCommissionsQuery()));
        }

        [HttpGet("~/api/v1/sales-managers/stores")]
        [ProducesResponseType(typeof(ResponseResult<List<SalesManagerCatalogDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetMyStoresAsync()
        {
            if (!_httpContextService.IsGestorVentas)
                return Forbid();

            return Ok(await Sender.Send(new GetMySalesManagerStoresQuery()));
        }
    }
}
