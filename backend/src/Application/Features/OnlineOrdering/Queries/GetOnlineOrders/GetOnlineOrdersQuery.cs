using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Queries.GetOnlineOrders
{
    /// <summary>
    /// Tamaños de página de la vista de pedidos (F5, T1).
    ///
    /// Viven fuera del handler porque son el VALOR POR DEFECTO de los parámetros del query, y un
    /// default de un `record` tiene que ser una constante de tiempo de compilación. Tenerlos en un
    /// solo sitio evita que el 20 del parámetro y el 20 de la normalización se separen.
    /// </summary>
    internal static class OnlineOrderPaging
    {
        /// <summary>Página por defecto: una tabla de 20 filas cabe en la vista sin scroll absurdo.</summary>
        public const int DefaultPageSize = 20;

        /// <summary>
        /// Tope duro. Sin él, `?pageSize=100000` traería el histórico entero en una respuesta y
        /// devolvería el endpoint a ser "traer todos los pedidos", que es justo lo que el
        /// paginado viene a evitar.
        /// </summary>
        public const int MaxPageSize = 100;
    }

    /// <summary>
    /// Listado paginado y filtrado de los pedidos online de la tienda del contexto (F5, vista
    /// "Pedidos"). Los siete filtros son opcionales y se combinan con Y: ninguno sin usar cambia la
    /// consulta.
    ///
    /// NO lleva `StoreId` en ningún parámetro —ni para filtrar ni para ordenar— por la misma razón
    /// que la configuración: la tienda es la de la sesión, y aceptarla en la entrada dejaría que un
    /// dueño listara los pedidos de otra tienda escribiendo un id en la URL.
    ///
    /// `Search` contrasta contra <see cref="Order.Code"/> y <see cref="Order.CustomerPhone"/> porque
    /// son las dos cosas que una persona repite al teléfono: el código que se le dictó y el
    /// número de quien pidió.
    /// </summary>
    public sealed record GetOnlineOrdersQuery(
        OrderStatus? Status = null,
        OrderPaymentStatus? PaymentStatus = null,
        OrderDeliveryType? DeliveryType = null,
        Guid? DriverId = null,
        DateTime? From = null,
        DateTime? To = null,
        string? Search = null,
        int Page = 1,
        int PageSize = OnlineOrderPaging.DefaultPageSize) : IQuery<OnlineOrderPageDto>;

    public class GetOnlineOrdersQueryHandler : IQueryHandler<GetOnlineOrdersQuery, OnlineOrderPageDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetOnlineOrdersQueryHandler(
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OnlineOrderPageDto>> Handle(
            GetOnlineOrdersQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            int page = query.Page < 1 ? 1 : query.Page;
            int pageSize = NormalizePageSize(query.PageSize);

            PagedOrders result = await _orderRepository.GetPagedByStoreIdAsync(
                storeId,
                new OrderListFilter(
                    query.Status,
                    query.PaymentStatus,
                    query.DeliveryType,
                    query.DriverId,
                    NormalizeFrom(query.From),
                    NormalizeTo(query.To),
                    NormalizeSearch(query.Search)),
                (page - 1) * pageSize,
                pageSize);

            return ResponseResult.Success(new OnlineOrderPageDto
            {
                Items = result.Items.Select(Map).ToList(),
                Total = result.Total,
                Page = page,
                PageSize = pageSize,
            });
        }

        /// <summary>
        /// Acota el tamaño de página por los dos lados: un 0 o negativo daría un `Take` negativo
        /// (que EF interpreta como "sin límite"), y un enorme convertiría el listado en una
        /// descarga del histórico. El `PageSize` que se devuelve en la página es el YA NORMALIZADO,
        /// para que la vista sepa cuántas filas pedir en la siguiente en vez de calcularlo otra vez.
        /// </summary>
        private static int NormalizePageSize(int pageSize)
            => pageSize < 1 ? OnlineOrderPaging.DefaultPageSize
                : pageSize > OnlineOrderPaging.MaxPageSize ? OnlineOrderPaging.MaxPageSize
                : pageSize;

        /// <summary>
        /// Los dos extremos del rango son DÍAS, no instantes, y el filtro por rango es el que la
        /// vista usa para "hoy" y "esta semana". `<input type="date">` manda `"2026-10-07"`, el
        /// binder lo aterriza en <c>2026-10-07 00:00:00</c>, y reenviarlo tal cual deja el extremo
        /// SUPERIOR en la medianoche que ARRANCA el día elegido: `from = to` produce una ventana
        /// de cero ticks y "los pedidos del 7" sale vacío salvo el pedido exacto de medianoche.
        ///
        /// Por eso se normaliza AQUÍ y no en el repositorio: el filtro que el handler construye es
        /// el que se ejecuta, y una aritmética de fechas repartida en dos capas es imposible de
        /// comprobar desde un test de una de ellas. El repositorio conserva sus `<=`/`>=`: lo que
        /// llega ya es el intervalo que la persona pidió, cerrado y con los dos días dentro.
        ///
        /// `null` se devuelve intacto en los dos lados: normalizar NO es rellenar, y un `?from=` sin
        /// `?to=` tiene que seguir siendo "sin límite superior", no "hasta el final del tiempo".
        /// </summary>
        private static DateTime? NormalizeFrom(DateTime? from)
            => from?.Date;

        /// <inheritdoc cref="NormalizeFrom"/>
        /// <remarks>
        /// El último tick del día y no las 23:59:59 porque <c>Order.Date</c> es un
        /// <c>timestamp</c> de PostgreSQL, que guarda microsegundos: con segundos enteros,
        /// <c>23:59:59.500</c> quedaría fuera de un rango que la persona eligió completo.
        ///
        /// <c>9999-12-31</c> no tiene "día siguiente" y <see cref="DateTime.AddDays(int)"/> lanza
        /// <see cref="ArgumentOutOfRangeException"/>; un <c>?to=9999-12-31</c> es una URL válida,
        /// así que ahí el extremo se queda donde ya estaba en vez de devolver un 500.
        /// </remarks>
        private static DateTime? NormalizeTo(DateTime? to)
        {
            if (to is not { } value)
                return null;

            DateTime day = value.Date;
            return day == DateTime.MaxValue.Date ? DateTime.MaxValue : day.AddDays(1).AddTicks(-1);
        }

        /// <summary>
        /// Limpia el texto de búsqueda y convierte un campo en blanco en "no filtrar". Sin esto, un
        /// `?search=` vacío (que cualquier barra de búsqueda manda al vaciarse) sería un predicado
        /// `Contains("")` en la base, que en PostgreSQL coincide con TODO: el usuario vería la
        /// lista sin saber que pidió filtrar, y el coste de la búsqueda sobre el histórico completo
        /// se pagaría en cada tecla.
        ///
        /// El recorte es de AQUÍ y no solo del repositorio para que el filtro que el handler
        /// construye sea el que se ejecuta; el repositorio vuelve a recortar porque no puede dar
        /// por hecho quién lo llama.
        /// </summary>
        private static string? NormalizeSearch(string? search)
            => string.IsNullOrWhiteSpace(search) ? null : search.Trim();

        /// <summary>
        /// Mapeo explícito (no un `select *` ni un spread) por la misma razón que en la
        /// configuración: un campo nuevo de la entidad no debe aparecer en el DTO por accidente. En
        /// particular el listado NO trae líneas — un pedido con 30 líneas aparecería 30 veces en la
        /// respuesta si el `Include` fuera automático— y eso también es lo que permite que el
        /// listado se lea sin `Include`.
        /// </summary>
        private static OnlineOrderListItemDto Map(Order order) => new()
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
        };
    }
}