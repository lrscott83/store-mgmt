using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Queries.GetOnlineOrderStats
{
    /// <summary>
    /// Métricas agregadas de los pedidos online de la tienda del contexto (F6, T1, vista "Ventas").
    /// Los cinco filtros son opcionales y se combinan con Y: ninguno sin usar cambia la consulta.
    ///
    /// NO lleva `StoreId` en ningún parámetro —ni para filtrar ni para agrupar— por la misma razón
    /// que el listado de F5: la tienda es la de la sesión, y aceptarla en la entrada dejaría que un
    /// dueño leyera las ventas de cualquier tienda escribiendo un id en la URL (criterio 7).
    ///
    /// El cálculo está en la base, no aquí: este handler NORMALIZA el rango, pide el agregado y lo
    /// traduce. Recalcular en C# obligaría a traer el histórico entero, que es justo lo que el
    /// agregado evita.
    /// </summary>
    /// <param name="From">Extremo inferior del rango, un DÍA (D2).</param>
    /// <param name="To">Extremo superior del rango, un DÍA (D2).</param>
    public sealed record GetOnlineOrderStatsQuery(
        DateTime? From = null,
        DateTime? To = null,
        OrderStatus? Status = null,
        OrderPaymentStatus? PaymentStatus = null,
        OrderDeliveryType? DeliveryType = null) : IQuery<OnlineOrderStatsDto>;

    public class GetOnlineOrderStatsQueryHandler
        : IQueryHandler<GetOnlineOrderStatsQuery, OnlineOrderStatsDto>
    {
        /// <summary>
        /// Decimales del ticket medio. Es la unidad mínima de la moneda, y sin redondear
        /// <c>100m / 3</c> saldría en el JSON como <c>33.33333333333333333333333333</c>: 28
        /// dígitos que el frontend tendría que recortar y que nadie lee.
        ///
        /// Se redondea SOLO el ticket medio, que es un número DERIVADO y por definición no exacto.
        /// Los importes que se suman no se tocan: `TotalSales`, `PaidAmount` y `PendingAmount` son
        /// sumas de `Order.Total`, y redondear una suma cambiaría el dinero que dice el panel.
        /// </summary>
        private const int AverageTicketDecimals = 2;

        private readonly IHttpContextService _httpContextService;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetOnlineOrderStatsQueryHandler(
            IHttpContextService httpContextService,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _orderRepository = orderRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OnlineOrderStatsDto>> Handle(
            GetOnlineOrderStatsQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            OrderAggregateStats stats = await _orderRepository.GetStatsByStoreIdAsync(
                storeId,
                new OrderStatsFilter(
                    query.Status,
                    query.PaymentStatus,
                    query.DeliveryType,
                    NormalizeFrom(query.From),
                    NormalizeTo(query.To)));

            return ResponseResult.Success(Map(stats));
        }

        /// <summary>
        /// Traducción del agregado al DTO. Todo lo que llega se copia TAL CUAL salvo el ticket
        /// medio, que es el único valor que este handler CALCULA: si volviera a sumar o a
        /// reinterpretar cualquier otro, habría dos verdades sobre los mismos números y dejarían de
        /// cuadrar en cuanto una cambiara.
        /// </summary>
        private static OnlineOrderStatsDto Map(OrderAggregateStats stats) => new()
        {
            OrdersCount = stats.OrdersCount,
            NonCancelledCount = stats.NonCancelledCount,
            TotalSales = stats.TotalSales,
            AverageTicket = AverageTicket(stats),
            PaidCount = stats.PaidCount,
            PaidAmount = stats.PaidAmount,
            PendingCount = stats.PendingCount,
            PendingAmount = stats.PendingAmount,
            Currency = stats.Currency,
            ByStatus = Breakdown(stats.ByStatus, (OrderStatus status, int count) => new OnlineOrderStatusCountDto
            {
                Status = status,
                Count = count,
            }),
            ByDeliveryType = Breakdown(stats.ByDeliveryType, (OrderDeliveryType type, int count) => new OnlineOrderDeliveryTypeCountDto
            {
                DeliveryType = type,
                Count = count,
            }),
        };

        /// <summary>
        /// EL TICKET MEDIO, y el único cálculo de esta unidad.
        ///
        /// Se divide por <see cref="OrderAggregateStats.NonCancelledCount"/> y NO por
        /// <see cref="OrderAggregateStats.OrdersCount"/>, porque <c>TotalSales</c> excluye los
        /// cancelados: dividir por el total bajaría el ticket medio en cuanto hubiera uno, y es el
        /// número más grande de la vista. Tres pedidos de 100 con uno cancelado darían 100 (2 × 100 /
        /// 2) y no 100 (300 / 3) por casualidad, pero con importes distintos la diferencia se ve:
        /// 100 + 200 + 999 cancelado daría un ticket medio de 150 real y uno de 433 inventado.
        ///
        /// El denominador cero es el caso que NO es opcional: un rango donde todo está cancelado
        /// (o una tienda que aún no vendió) daría <c>DivideByZeroException</c>, que saldría como un
        /// 500 de un panel que solo quería pintar un 0. <c>NonCancelledCount</c> es la guarda.
        ///
        /// <c>MidpointRounding.AwayFromZero</c> y no el redondeo "al par" de .NET porque esto es
        /// dinero: <c>1.005 → 1.01</c> es lo que espera quien lee el panel.
        /// </summary>
        private static decimal AverageTicket(OrderAggregateStats stats)
            => stats.NonCancelledCount > 0
                ? decimal.Round(
                    stats.TotalSales / stats.NonCancelledCount,
                    AverageTicketDecimals,
                    MidpointRounding.AwayFromZero)
                : 0m;

        /// <summary>
        /// Los desgloses salen COMPLETOS y en el ORDEN del enum, con un 0 para cada valor sin
        /// pedidos en el rango.
        ///
        /// El repositorio devuelve solo los presentes (es lo que la base sabe), y el hueco se
        /// rellena aquí porque la lista completa de la D11 es información de DOMINIO, no del rango:
        /// el cliente es quien decide qué pintar, y un eje que aparece y desaparece con el filtro
        /// hace que la tarjeta salte de sitio en cada cambio.
        ///
        /// <see cref="Enum.GetValues{T}"/> ordena por valor, así que el orden es el de la tabla de
        /// estados y no el que devuelva la base.
        /// </summary>
        private static List<TRow> Breakdown<TKey, TRow>(
            IReadOnlyDictionary<TKey, int> counts,
            Func<TKey, int, TRow> row) where TKey : struct, Enum
            => Enum.GetValues<TKey>()
                .Select(key => row(key, counts.TryGetValue(key, out int count) ? count : 0))
                .ToList();

        /// <summary>
        /// `<input type="date">` manda `"2026-10-07"` y el binder lo aterriza en
        /// <c>2026-10-07 00:00:00</c>. Reenviarlo tal cual deja el extremo SUPERIOR en la medianoche
        /// que ARRANCA el día elegido: <c>from = to</c> produce una ventana de cero ticks y "las
        /// ventas de hoy" sale vacía salvo un pedido exacto de medianoche.
        ///
        /// La normalización vive AQUÍ y no en el repositorio, igual que en F5: el filtro que este
        /// handler construye es el que se ejecuta, y una aritmética de fechas repartida en dos
        /// capas es imposible de comprobar desde un test de una de ellas. El repositorio conserva
        /// sus `<=`/`>=`: lo que llega ya es el intervalo que la persona pidió, cerrado y con los dos
        /// días dentro.
        ///
        /// Normalizar NO es rellenar: `null` se devuelve intacto en los dos lados, porque un
        /// <c>?from=</c> sin <c>?to=</c> tiene que seguir siendo "sin límite superior".
        /// </summary>
        private static DateTime? NormalizeFrom(DateTime? from)
            => from?.Date;

        /// <inheritdoc cref="NormalizeFrom"/>
        /// <remarks>
        /// El último tick del día y no las <c>23:59:59</c> porque <c>Order.Date</c> es un
        /// <c>timestamp</c> de PostgreSQL, que guarda microsegundos: con segundos enteros,
        /// <c>23:59:59.500</c> quedaría fuera de un rango que la persona eligió completo.
        ///
        /// <c>9999-12-31</c> no tiene "día siguiente" y <c>AddDays(1)</c> lanza
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
    }
}