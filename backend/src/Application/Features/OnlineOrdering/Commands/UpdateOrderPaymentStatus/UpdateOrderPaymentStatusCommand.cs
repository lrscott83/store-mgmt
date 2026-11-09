using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Common;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.UpdateOrderPaymentStatus
{
    /// <summary>
    /// Marca el pago de un pedido a mano (F5, T4, D3/D12): la acción "marcar pagado" del panel.
    ///
    /// El pago NO es un estado del pedido: es un eje INDEPENDIENTE. Por eso este comando NO pasa por
    /// la máquina de `Order.ChangeStatus` y por eso no hay transiciones que validar — un pedido
    /// `New` puede estar pagado (se pagó por adelantado) y uno `Delivered` puede seguir pendiente
    /// (el cobro se hace en la puerta, después de entregar). Tratar el pago como un estado
    /// ataría las dos columnas y haría imposible una de esas dos situaciones reales.
    ///
    /// Solo hay dos valores y en los dos sentidos: `Pending ⇄ Paid`. No hay "Reembolsado" porque no
    /// hay pasarela que lo genere (D3): una errata se corrige volviendo a `Pending`, y por eso este
    /// handler no trata `Paid` como terminal.
    ///
    /// No lleva `StoreId`: la tienda es la de la sesión, y un pedido de otra tienda es un 404 —
    /// indistinguible de uno inexistente a propósito (criterio 7).
    /// </summary>
    public sealed record UpdateOrderPaymentStatusCommand(Guid Id, OrderPaymentStatus PaymentStatus)
        : ICommand<bool>;

    public class UpdateOrderPaymentStatusCommandHandler
        : ICommandHandler<UpdateOrderPaymentStatusCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateOrderPaymentStatusCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(
            UpdateOrderPaymentStatusCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = StoreContextGuard.RequireStoreId(_httpContextService, _localizer);

            // El `storeId` va en el MISMO predicado que el id: pedir el pedido primero y comprobar
            // la tienda después dejaría una ventana con el pedido ajeno ya cargado.
            //
            // La FILA, sin `Include`s: este comando solo escribe `PaymentStatus`/`PaidAt`, así que
            // traer las líneas y el repartidor serían dos `JOIN` por petición para un resultado que
            // nadie lee.
            Order order = await OnlineOrderAccess.GetRowAsync(
                _orderRepository, storeId, request.Id, cancellationToken);

            // El pago no tiene máquina de estados —un pedido en `Creado` puede estar pagado por
            // adelantado—, pero SÍ tiene una invariante: un pedido entregado ya está pagado. La
            // puerta es `ChangePaymentStatus`, que es la que la hace cumplir.
            OrderChangedField changed;

            try
            {
                changed = order.ChangePaymentStatus(request.PaymentStatus);
            }
            catch (DeliveredOrderCannotBeUnpaidException exception)
            {
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }

            // Actualización PARCIAL: el dominio ya dijo qué campos mutó (el pago y, cuando
            // corresponde, su fecha). La fila la comparten el estado y el repartidor, que son de
            // otras acciones y pueden estar cambiándose en este mismo instante: escribir la fila
            // entera reescribiría sus valores leídos antes y los borraría.
            // `ApplicationDbContext` es NoTracking: sin marcar columnas, `SaveChanges` no
            // escribiría NADA — sin error y sin aviso.
            await _orderRepository.UpdatePartialAsync(order, changed, cancellationToken);

            return ResponseResult.Success(
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}