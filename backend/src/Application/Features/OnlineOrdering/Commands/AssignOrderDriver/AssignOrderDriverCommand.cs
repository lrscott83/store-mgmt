using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.DeliveryDrivers;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.AssignOrderDriver
{
    /// <summary>
    /// Asigna (o desasigna) el repartidor de un pedido (F5, T5, D5). F5 es la dueña única de esta
    /// operación; el CRUD de repartidores es F7 y el filtro `driverId` del listado es lo que
    /// permite leer "los pedidos de este repartidor".
    ///
    /// La validación del repartidor es de seguridad de negocio, no de ergonomía, y por eso NO la
    /// hace el validador: depende de lo que hay en la base (¿existe?, ¿es de esta tienda?, ¿está
    /// activo?) y eso solo se puede responder con una consulta.
    ///
    /// `DriverId = null` es una entrada VÁLIDA —desasignar—, no un dato ausente: por eso el
    /// comando no lleva validador y por eso desasignar NO consulta repartidor (no hay id que
    /// validar).
    ///
    /// La asignación NO mueve el estado del pedido: el flujo de la D11 no tiene "En camino" (D18), y
    /// el reparto es un dato del pedido, no un paso de su ciclo de vida.
    /// </summary>
    public sealed record AssignOrderDriverCommand(Guid Id, Guid? DriverId) : ICommand<bool>;

    public class AssignOrderDriverCommandHandler : ICommandHandler<AssignOrderDriverCommand, bool>
    {
        /// <summary>
        /// Mensaje del 404. Va literal, no por `IStringLocalizer`, por la misma razón que en
        /// `UpdateOrderStatusCommandHandler`: la clave equivalente en `Resources/Localization/*.resx`
        /// no existe y añadirla es un cambio de Resources, fuera de la superficie de esta unidad.
        /// </summary>
        private const string OrderNotFoundMessage = "Online order not found.";

        /// <summary>
        /// Mensaje del repartidor no asignable. Deliberadamente el MISMO para "no existe", "es de
        /// otra tienda" y "está dado de baja": si los distinguiera, un id ajeno devolvería un
        /// "ese repartidor no es tuyo" que convierte el endpoint en un oráculo para recorrer ids de
        /// otras tiendas (criterio 7).
        /// </summary>
        private const string DriverNotAssignableMessage = "The delivery driver is not available for this store.";

        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IDeliveryDriverRepository _driverRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public AssignOrderDriverCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IDeliveryDriverRepository driverRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _driverRepository = driverRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(
            AssignOrderDriverCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // El `storeId` va en el MISMO predicado que el id: pedir el pedido primero y comprobar
            // la tienda después dejaría una ventana con el pedido ajeno ya cargado.
            Order? order = await _orderRepository.GetByIdWithItemsAsync(storeId, request.Id);
            if (order is null)
                throw new ApiException(OrderNotFoundMessage, HttpStatusCode.NotFound);

            if (request.DriverId is { } driverId)
            {
                // `includeInactive` se deja en false a propósito: la baja de un repartidor es
                // LÓGICA (`IsActive`), no borrado, así que los pedidos que ya entregó conservan su
                // referencia pero no se le puede asignar uno nuevo. El filtro es del repositorio —
                // esta lista ya sale sin los dados de baja y así el handler no reimplementa la regla.
                IReadOnlyCollection<DeliveryDriver> drivers =
                    await _driverRepository.GetByStoreIdAsync(storeId);

                if (!drivers.Any(driver => driver.Id == driverId))
                    throw new ApiException(DriverNotAssignableMessage, HttpStatusCode.BadRequest);
            }

            // null = desasignar. Es una operación válida: el dueño se equivocó al asignar, o el
            // repartidor se retiró. No es un dato ausente y por eso no se valida.
            order.DriverId = request.DriverId;

            // `ApplicationDbContext` es NoTracking: mutar la fila cargada y llamar a `SaveChanges`
            // sin marcar NO escribiría nada — sin error y sin aviso.
            await _orderRepository.UpdateAsync(order);

            return ResponseResult.Success(
                await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}