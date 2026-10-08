using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using Application.Features.OnlineOrdering.Queries.GetDeliveryDrivers;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de GESTIÓN del catálogo de repartidores (F7, vista "Repartidores"). Un catálogo de
    /// personas: no aparece aquí ningún endpoint que toque un pedido.
    ///
    /// ASIGNAR un repartidor a un pedido es un acto sobre el PEDIDO y vive en
    /// `PATCH /api/v1/online-orders/{id}/driver` (`AssignOrderDriverCommand`, F5), que es quien
    /// valida que el repartidor sea de la tienda y esté activo. Por eso este controlador no la
    /// duplica.
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (`~/api/v1/delivery-drivers`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]`, y aunque aquí el token habría dado bien el segmento, los
    /// atributos de ruta se COMBINAN con los heredados — una ruta de action sin `~/` añadiría cada
    /// endpoint también en `api/v1/DeliveryDrivers`. El `~/` REEMPLAZA la plantilla del
    /// controlador, que es justo lo que hace `OnlineOrderingController` y `PublicCatalogController`.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]
    public class DeliveryDriversController : BaseApiController
    {
        /// <summary>
        /// Repartidores de la tienda actual. `?activeOnly=true` incluye los dados de baja (la vista
        /// los necesita para poder reactivarlos); por defecto solo salen los activos. Una tienda
        /// sin repartidores devuelve una lista vacía, no un 404.
        /// </summary>
        [HttpGet("~/api/v1/delivery-drivers")]
        [ProducesResponseType(typeof(ResponseResult<IEnumerable<DeliveryDriverDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetDriversAsync([FromQuery] bool activeOnly = false)
        {
            return Ok(await Sender.Send(new GetDeliveryDriversQuery(activeOnly)));
        }

        /// <summary>
        /// Da de alta un repartidor. La tienda es la del contexto: el cuerpo no la lleva, y por eso
        /// no puede crear repartidores en la tienda de otro. Nace activo.
        /// </summary>
        [HttpPost("~/api/v1/delivery-drivers")]
        [ProducesResponseType(typeof(ResponseResult<DeliveryDriverDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateDriverAsync([FromBody] CreateDeliveryDriverCommand request)
        {
            return Ok(await Sender.Send(request));
        }

        /// <summary>
        /// Edita nombre, teléfono y el interruptor de activo. Un repartidor de otra tienda es un
        /// 404 (no se distingue de uno inexistente). Apagar `IsActive` es baja LÓGICA: no borra la
        /// fila ni los pedidos que ya llevó.
        /// </summary>
        [HttpPatch("~/api/v1/delivery-drivers/{id}")]
        [ProducesResponseType(typeof(ResponseResult<DeliveryDriverDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdateDriverAsync(Guid id, [FromBody] UpdateDeliveryDriverCommand request)
        {
            // El id de la RUTA manda sobre el del cuerpo: un PATCH sin id en la URL no tiene a qué
            // fila apuntar, y aceptar el del cuerpo dejaría dos fuentes de verdad para lo mismo.
            return Ok(await Sender.Send(new UpdateDeliveryDriverCommand
            {
                Id = id,
                Name = request.Name,
                Phone = request.Phone,
                IsActive = request.IsActive,
            }));
        }
    }
}
