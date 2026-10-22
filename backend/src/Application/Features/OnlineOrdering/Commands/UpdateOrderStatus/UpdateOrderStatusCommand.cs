using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.OrderItems;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.Orders;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.UpdateOrderStatus
{
    /// <summary>
    /// Mueve un pedido por la tabla de estados de la D11 (F5, T3). La acción "cambiar estado" del
    /// panel de pedidos.
    ///
    /// La transición NO se decide aquí: la decide <see cref="Order.ChangeStatus"/>, que es la
    /// única puerta al estado. Este comando solo translate el veredicto del dominio a un HTTP:
    /// alcanzable → 200, no alcanzable → 400.
    ///
    /// No lleva `StoreId`: la tienda es la de la sesión. Un pedido de otra tienda no es un caso
    /// "cambiar y ya", es un 404 — indistinguible de uno inexistente a propósito (criterio 7).
    ///
    /// No hay estado "En camino" (D18): el panel no lo ofrece porque el dominio no lo tiene.
    /// </summary>
    /// <param name="Id">Pedido a mover.</param>
    /// <param name="Status">Estado de destino.</param>
    /// <param name="DriverId">
    /// Repartidor. Obligatorio al pasar a <see cref="OrderStatus.Transportando"/>, ignorado —de
    /// hecho rechazado por el dominio— en cualquier otra transición.
    /// </param>
    /// <param name="CancellationReason">
    /// Razón de la cancelación, texto libre. Obligatoria al pasar a
    /// <see cref="OrderStatus.Cancelado"/>.
    /// </param>
    public sealed record UpdateOrderStatusCommand(
        Guid Id,
        OrderStatus Status,
        Guid? DriverId = null,
        string? CancellationReason = null) : ICommand<bool>;

    public class UpdateOrderStatusCommandHandler : ICommandHandler<UpdateOrderStatusCommand, bool>
    {
        /// <summary>
        /// Mensaje del 404. Va literal, no por `IStringLocalizer`, por la misma razón que en
        /// `GetOnlineOrderByIdQueryHandler`: la clave equivalente en `Resources/Localization/*.resx`
        /// no existe y añadirla es un cambio de Resources, fuera de la superficie de esta unidad.
        /// Un texto en inglés claro es mejor que una clave sin traducir que el cliente recibe tal cual.
        /// </summary>
        private const string OrderNotFoundMessage = "Online order not found.";

        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IOrderSalesManagerRepository _orderSalesManagerRepository;
        private readonly IProductSalesCommissionRepository _productSalesCommissionRepository;
        private readonly IOrderSalesCommissionRepository _orderSalesCommissionRepository;

        public UpdateOrderStatusCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer,
            IStoreModuleRepository storeModuleRepository,
            IOrderSalesManagerRepository orderSalesManagerRepository,
            IProductSalesCommissionRepository productSalesCommissionRepository,
            IOrderSalesCommissionRepository orderSalesCommissionRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _localizer = localizer;
            _storeModuleRepository = storeModuleRepository;
            _orderSalesManagerRepository = orderSalesManagerRepository;
            _productSalesCommissionRepository = productSalesCommissionRepository;
            _orderSalesCommissionRepository = orderSalesCommissionRepository;
        }

        public async Task<ResponseResult<bool>> Handle(
            UpdateOrderStatusCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // El `storeId` va en el MISMO predicado que el id (dentro de `GetByIdWithItemsAsync`):
            // pedir el pedido primero y comprobar la tienda después dejaría una ventana con el
            // pedido ajeno ya cargado, y "no lo toco si no es mío" es el patrón que produce la fuga.
            Order? order = await _orderRepository.GetByIdWithItemsAsync(storeId, request.Id);
            if (order is null)
                throw new ApiException(OrderNotFoundMessage, HttpStatusCode.NotFound);

            try
            {
                // La tabla vive en el dominio. `ChangeStatus` no toca el estado si la transición no
                // es alcanzable, así que aquí no hay nada que deshacer.
                order.ChangeStatus(request.Status, request.DriverId, request.CancellationReason);
            }
            catch (InvalidOrderStatusTransitionException exception)
            {
                // Traducción de capa: `Domain` no puede lanzar `ApiException` (la dependencia va en
                // el sentido contrario), y sin esta traducción una transición inválida —un 400 del
                // cliente— saldría como un 500 del servidor.
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }
            catch (MissingCancellationReasonException exception)
            {
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }
            catch (MissingDeliveryDriverException exception)
            {
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }
            catch (UnexpectedStatusOptionException exception)
            {
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }

            // T6: la comisión nace en la MISMA transacción que la entrega. `Entregado` es
            // terminal, así que no hay una segunda entrega que duplique; el índice único de
            // `OrderItemId` es la garantía de fondo.
            if (request.Status == OrderStatus.Entregado)
                await GenerateCommissionsAsync(order);

            // `ApplicationDbContext` es NoTracking: mutar la fila cargada y llamar a `SaveChanges`
            // sin marcar NO escribiría nada — sin error y sin aviso. El `Update` explícito del
            // repositorio es lo que adjunta la entidad como Modified.
            await _orderRepository.UpdateAsync(order);

            return ResponseResult.Success(
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

        /// <summary>
        /// Genera una comisión por cada `OrderItem` de un pedido ENTREGADO, atribuido a un gestor y
        /// de una tienda con el módulo 21 activo. La configuración se lee EN ESTE MOMENTO (la
        /// vigente al entregar). Sin configuración no hay fila y la línea vale 0; no se inventa un
        /// tipo ni se convierte moneda.
        ///
        /// Porcentaje: se redondea la comisión UNITARIA y se multiplica por la cantidad. Fijo: es
        /// por unidad (3 unidades = 3 veces el fijo). El resultado se redondea a 2 decimales.
        /// </summary>
        private async Task GenerateCommissionsAsync(Order order)
        {
            IReadOnlyCollection<int> activeModuleIds =
                await _storeModuleRepository.GetPublicActiveModuleIdsByStoreIdAsync(order.StoreId);
            if (!activeModuleIds.Contains((int)ModuleType.GestoresVentas))
                return;

            OrderSalesManager? attribution = await _orderSalesManagerRepository.GetByOrderIdAsync(order.Id);
            if (attribution is null)
                return;

            foreach (OrderItem item in order.OrderItems)
            {
                OrderSalesCommission? existing =
                    await _orderSalesCommissionRepository.GetByOrderItemIdAsync(item.Id);
                if (existing is not null)
                    continue;

                ProductSalesCommission? config =
                    await _productSalesCommissionRepository.GetByProductIdAsync(item.ProductId);
                if (config is null)
                    continue;

                decimal unitCommission = config.Type == SalesCommissionType.Percentage
                    ? Math.Round(item.Price * config.Value / 100m, 2, MidpointRounding.AwayFromZero)
                    : Math.Round(config.Value, 2, MidpointRounding.AwayFromZero);
                decimal amount = Math.Round(
                    unitCommission * item.Quantity, 2, MidpointRounding.AwayFromZero);

                OrderSalesCommission commission = OrderSalesCommission.Create(
                    order.Id,
                    item.Id,
                    attribution.SalesManagerId,
                    attribution.OwnerId,
                    order.StoreId,
                    config.Type,
                    config.Value,
                    item.Price,
                    item.Quantity,
                    amount,
                    config.Currency,
                    order.TenantId);

                await _orderSalesCommissionRepository.AddAsync(commission);
            }
        }
    }
}