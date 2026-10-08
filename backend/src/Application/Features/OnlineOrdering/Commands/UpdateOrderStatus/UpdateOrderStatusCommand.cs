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
    public sealed record UpdateOrderStatusCommand(Guid Id, OrderStatus Status) : ICommand<bool>;

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

        public UpdateOrderStatusCommandHandler(
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
                // La tabla de la D11 vive en el dominio. `ChangeStatus` no toca el estado si la
                // transición no es alcanzable, así que aquí no hay nada que deshacer.
                order.ChangeStatus(request.Status);
            }
            catch (InvalidOrderStatusTransitionException exception)
            {
                // Traducción de capa: `Domain` no puede lanzar `ApiException` (la dependencia va en
                // el sentido contrario), y sin esta traducción una transición inválida —un 400 del
                // cliente— saldría como un 500 del servidor.
                throw new ApiException(exception.Message, HttpStatusCode.BadRequest);
            }

            // `ApplicationDbContext` es NoTracking: mutar la fila cargada y llamar a `SaveChanges`
            // sin marcar NO escribiría nada — sin error y sin aviso. El `Update` explícito del
            // repositorio es lo que adjunta la entidad como Modified.
            await _orderRepository.UpdateAsync(order);

            return ResponseResult.Success(
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}