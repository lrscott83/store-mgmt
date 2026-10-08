using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
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
        /// <summary>
        /// Mensaje del 404. Va literal, no por `IStringLocalizer`, por la misma razón que en
        /// `UpdateOrderStatusCommandHandler`: la clave equivalente en `Resources/Localization/*.resx`
        /// no existe y añadirla es un cambio de Resources, fuera de la superficie de esta unidad.
        /// </summary>
        private const string OrderNotFoundMessage = "Online order not found.";

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
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // El `storeId` va en el MISMO predicado que el id: pedir el pedido primero y comprobar
            // la tienda después dejaría una ventana con el pedido ajeno ya cargado.
            Order? order = await _orderRepository.GetByIdWithItemsAsync(storeId, request.Id);
            if (order is null)
                throw new ApiException(OrderNotFoundMessage, HttpStatusCode.NotFound);

            // Asignación directa y no `ChangePaymentStatus(...)`: el pago no tiene máquina de
            // estados, y envolver un setter en un método "por simetría" con el estado ocultaría
            // justamente lo que hace distinto a esta columna.
            order.PaymentStatus = request.PaymentStatus;

            // `ApplicationDbContext` es NoTracking: mutar la fila cargada y llamar a `SaveChanges`
            // sin marcar NO escribiría nada — sin error y sin aviso.
            await _orderRepository.UpdateAsync(order);

            return ResponseResult.Success(
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}