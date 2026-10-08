using Application.Dtos.OnlineOrdering;
using Application.Features.OnlineOrdering.Commands.AssignOrderDriver;
using Application.Features.OnlineOrdering.Commands.UpdateOrderPaymentStatus;
using Application.Features.OnlineOrdering.Commands.UpdateOrderStatus;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrderById;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrderStats;
using Application.Features.OnlineOrdering.Queries.GetOnlineOrders;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    /// <summary>
    /// Endpoints de GESTIÓN de pedidos online (F5, vista "Pedidos"): listar, abrir y cambiar
    /// estado, pago y repartidor.
    ///
    /// La feature es `OnlineOrdersAdmin` (D15) y NO `WebCatalogAdmin`: esta vista la opera el día a
    /// día el `StoreUser` también, mientras que la CONFIGURACIÓN de la tienda (que usa
    /// `WebCatalogAdmin`, en `OnlineOrderingController`) sigue siendo cosa del dueño. Dos features
    /// distintas porque son dos decisiones distintas: quién opera un pedido y quién publica el
    /// catálogo de la tienda.
    ///
    /// RUTAS ABSOLUTAS A PROPÓSITO (`~/api/v1/online-orders`): `BaseApiController` fija
    /// `[Route("api/v1/[controller]")]`, y el token `[controller]` no puede producir el segmento con
    /// guion de `online-orders`. Poner `[Route("api/v1/online-orders")]` en esta clase NO lo
    /// resolvería: los atributos de ruta se COMBINAN con los heredados, así que cada action
    /// quedaría además en `api/v1/OnlineOrders/...`. Una ruta action con `~/` REEMPLAZA la plantilla
    /// del controlador, que es lo que hacen `PublicCatalogController` y `OnlineOrderingController`.
    ///
    /// Ninguna acción acepta `StoreId`: la tienda es la de la sesión, y el aislamiento se aplica
    /// DENTRO de los handlers (el `storeId` va en el mismo predicado que el id del pedido), que es
    /// donde no se puede saltar.
    /// </summary>
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]
    public class OnlineOrdersController : BaseApiController
    {
        /// <summary>
        /// Listado paginado y filtrado de los pedidos de la tienda. Los siete filtros son
        /// opcionales y se combinan con Y; `search` contrasta contra el código público y el
        /// teléfono, que es lo que una persona dicta o repite por WhatsApp.
        ///
        /// Los parámetros van explícitos (y no un `[FromQuery] GetOnlineOrdersQuery`) para que el
        /// contrato de la ruta se lea aquí: los nombres de la query son los nombres de la URL.
        /// </summary>
        [HttpGet("~/api/v1/online-orders")]
        [ProducesResponseType(typeof(ResponseResult<OnlineOrderPageDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetOrdersAsync(
            [FromQuery] OrderStatus? status,
            [FromQuery] OrderPaymentStatus? paymentStatus,
            [FromQuery] OrderDeliveryType? deliveryType,
            [FromQuery] Guid? driverId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] string? search,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            return Ok(await Sender.Send(new GetOnlineOrdersQuery(
                status, paymentStatus, deliveryType, driverId, from, to, search, page, pageSize)));
        }

        /// <summary>
        /// Detalle de un pedido con sus líneas y su repartidor. Un id de otra tienda devuelve 404,
        /// indistinguible de uno inexistente a propósito: si el endpoint dijera "ese pedido es de
        /// otra tienda", bastaría un id para recorrer tiendas ajenas (criterio 7).
        /// </summary>
        [HttpGet("~/api/v1/online-orders/{id}")]
        [ProducesResponseType(typeof(ResponseResult<OnlineOrderDetailDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetOrderAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetOnlineOrderByIdQuery(id)));
        }

        /// <summary>
        /// Métricas de los pedidos online de la tienda en un rango (F6, T2, vista "Ventas"):
        /// pedidos, ventas totales, ticket medio, pagado/pendiente y los desgloses por estado y
        /// modalidad.
        ///
        /// Comparte la feature `OnlineOrdersAdmin` con el resto de la clase —el dueño y el
        /// <c>StoreUser</c> gestionan pedidos y ventas igual— y por eso no hay una clase aparte:
        /// es la MISMA tabla y las MISMAS filas que la vista de "Pedidos", leídas de otra forma.
        ///
        /// Los parámetros van explícitos (y no un `[FromQuery] GetOnlineOrderStatsQuery`) por la
        /// misma razón que en <see cref="GetOrdersAsync"/>: que los nombres de la query sean los
        /// nombres de la URL se lea aquí, en el contrato de la ruta.
        ///
        /// `stats` es un segmento LITERAL y `GetOrderAsync` tiene un `{id}` en el mismo sitio. No es
        /// una colisión: cuando dos plantillas encajan en la misma URL gana la de segmento literal,
        /// así que <c>GET /api/v1/online-orders/stats</c> llega aquí y nunca al detalle. El orden de
        /// las acciones en la clase no influye; solo cuenta que `stats` no sea un `Guid`.
        /// </summary>
        [HttpGet("~/api/v1/online-orders/stats")]
        [ProducesResponseType(typeof(ResponseResult<OnlineOrderStatsDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetStatsAsync(
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to,
            [FromQuery] OrderStatus? status,
            [FromQuery] OrderPaymentStatus? paymentStatus,
            [FromQuery] OrderDeliveryType? deliveryType)
        {
            return Ok(await Sender.Send(new GetOnlineOrderStatsQuery(
                from, to, status, paymentStatus, deliveryType)));
        }

        /// <summary>
        /// Mueve el pedido por la tabla de estados de la D11. El servidor decide si la transición
        /// es alcanzable (`Order.ChangeStatus` es la única puerta): alcanzable → 200, no alcanzable
        /// → 400 con el motivo.
        ///
        /// NO hay estado "En camino" (D18): el flujo de la D11 no lo tiene y esta vista no lo ofrece.
        ///
        /// El `id` del CUERPO se descarta: el de la RUTA es el único que vale. Aceptar ambos haría
        /// que un cliente que copia y pega un body sobre otra ruta escribiera sobre un pedido que no
        /// está en la URL que creyó pulsar.
        /// </summary>
        [HttpPatch("~/api/v1/online-orders/{id}/status")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdateStatusAsync(Guid id, [FromBody] UpdateOrderStatusCommand request)
        {
            return Ok(await Sender.Send(new UpdateOrderStatusCommand(id, request.Status)));
        }

        /// <summary>
        /// Marca el pago a mano (D3/D12). El pago es un eje INDEPENDIENTE del estado: esto no mueve
        /// el pedido, y marcar el pago no requiere que el pedido esté entregado.
        /// </summary>
        [HttpPatch("~/api/v1/online-orders/{id}/payment")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatePaymentStatusAsync(Guid id, [FromBody] UpdateOrderPaymentStatusCommand request)
        {
            return Ok(await Sender.Send(new UpdateOrderPaymentStatusCommand(id, request.PaymentStatus)));
        }

        /// <summary>
        /// Asigna el repartidor, o lo desasigna con `driverId = null`. El repartidor tiene que ser
        /// de esta tienda y estar activo; un id que no lo es devuelve 400 —el mismo 400 que un id
        /// inexistente, para no convertir el endpoint en un oráculo de ids ajenos.
        /// </summary>
        [HttpPatch("~/api/v1/online-orders/{id}/driver")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> AssignDriverAsync(Guid id, [FromBody] AssignOrderDriverCommand request)
        {
            return Ok(await Sender.Send(new AssignOrderDriverCommand(id, request.DriverId)));
        }
    }
}