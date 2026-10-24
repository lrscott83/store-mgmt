using Application.Dtos.SalesManagers;
using Application.Features.SalesManagers.Commands.DeleteProductSalesCommission;
using Application.Features.SalesManagers.Commands.UpsertProductSalesCommission;
using Application.Features.SalesManagers.Queries.GetProductSalesCommissions;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Configuración de comisión por producto del módulo Gestores de ventas. Owner-only y gateada
    /// por el módulo 21 en la tienda seleccionada. Todo se guarda en `ProductSalesCommission`;
    /// `Product` no recibe columnas.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.GestoresVentasAdmin)]
    public class ProductSalesCommissionsController : BaseApiController
    {
        [HttpGet]
        [ProducesResponseType(typeof(ResponseResult<List<ProductSalesCommissionDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetAllAsync()
        {
            return Ok(await Sender.Send(new GetProductSalesCommissionsQuery()));
        }

        [HttpPut("{productId}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpsertAsync(
            Guid productId,
            [FromBody] UpsertProductSalesCommissionRequest request)
        {
            return Ok(await Sender.Send(new UpsertProductSalesCommissionCommand(
                productId, request.Type, request.Value, request.Currency)));
        }

        [HttpDelete("{productId}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteAsync(Guid productId)
        {
            return Ok(await Sender.Send(new DeleteProductSalesCommissionCommand(productId)));
        }
    }

    public sealed record UpsertProductSalesCommissionRequest(
        SalesCommissionType Type,
        decimal Value,
        Currency Currency);
}
