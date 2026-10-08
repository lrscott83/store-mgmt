using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.OrderItems;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Queries.GetOnlineOrderById
{
    /// <summary>
    /// Detalle de UN pedido de la tienda del contexto, con sus líneas y su repartidor (F5, T2: lo
    /// que se abre para confirmar, imprimir o auditar un pedido).
    ///
    /// El `storeId` NO es un parámetro: sale del contexto y se aplica dentro de la consulta. Un id
    /// de otra tienda no es un caso "devolver vacío" ni un caso "filtrar luego": es un 404, y esa
    /// indistinguibilidad con "no existe" es deliberada — si el endpoint dijera "ese pedido es de
    /// otra tienda", bastaría un id para recorrer tiendas ajenas (criterio 7).
    /// </summary>
    public sealed record GetOnlineOrderByIdQuery(Guid Id) : IQuery<OnlineOrderDetailDto>;

    public class GetOnlineOrderByIdQueryHandler : IQueryHandler<GetOnlineOrderByIdQuery, OnlineOrderDetailDto>
    {
        /// <summary>
        /// Mensaje del 404. Va literal, no por `IStringLocalizer`, porque la clave equivalente en
        /// `Resources/Localization/*.resx` no existe todavía: preferimos un texto en inglés claro a
        /// una clave sin traducir que el cliente recibiría tal cual. Añadir la clave localizada es
        /// un cambio de Resources, fuera de la superficie de esta unidad.
        /// </summary>
        private const string OrderNotFoundMessage = "Online order not found.";

        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetOnlineOrderByIdQueryHandler(
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OnlineOrderDetailDto>> Handle(
            GetOnlineOrderByIdQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            Order? order = await _orderRepository.GetByIdWithItemsAsync(storeId, query.Id);
            if (order is null)
                throw new ApiException(OrderNotFoundMessage, HttpStatusCode.NotFound);

            return ResponseResult.Success(Map(order));
        }

        /// <summary>
        /// El detalle es el pedido COMPLETO: lo de la fila del listado más las líneas, el domicilio
        /// y las notas. El mapeo es explícito por la misma razón que en el listado — un campo nuevo
        /// de la entidad no entra por accidente— y las líneas se ORDENAN por
        /// <see cref="OrderItem.OrderIndex"/> porque el repositorio no garantiza orden de salida: el
        /// orden en que el cliente escribió los productos es información, no un detalle de
        /// implementación que se pueda perder al leerlos.
        /// </summary>
        private static OnlineOrderDetailDto Map(Order order) => new()
        {
            Id = order.Id,
            Code = order.Code,
            CustomerName = order.CustomerName,
            CustomerPhone = order.CustomerPhone,
            DeliveryType = order.DeliveryType,
            Total = order.Total,
            Currency = order.Currency,
            Status = order.Status,
            PaymentStatus = order.PaymentStatus,
            DriverId = order.DriverId,
            DriverName = order.Driver?.Name,
            Date = order.Date,
            DeliveryAddress = order.DeliveryAddress,
            Notes = order.Notes,
            Lines = order.OrderItems
                .OrderBy(item => item.OrderIndex)
                .Select(MapLine)
                .ToList(),
        };

        private static OnlineOrderLineDto MapLine(OrderItem item) => new()
        {
            ProductId = item.ProductId,
            Name = item.Name,
            Quantity = item.Quantity,
            Price = item.Price,
            Currency = item.Currency,
            LineTotal = item.Price * item.Quantity,
        };
    }
}