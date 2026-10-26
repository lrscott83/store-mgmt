using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog.Queries.GetCatalogStatsOverview
{
    /// <summary>
    /// Estadísticas del catálogo de TODAS las tiendas. Endpoint SuperAdmin: es la vista general del
    /// panel, y devuelve además las tiendas con visitas en el periodo para alimentar el selector.
    ///
    /// <para><b>Es una suma.</b> Se lee la MISMA tabla de eventos con la MISMA ventana que el panel
    /// por tienda, sin el filtro por tienda: `VisitorHash` y `SessionHash` incluyen la tienda, así
    /// que el total global es exactamente la suma de los valores por tienda. No hay tablas nuevas,
    /// ni caché, ni agregados persistidos.</para>
    /// </summary>
    public sealed record GetCatalogStatsOverviewQuery(int Days = GetCatalogStatsOverviewQuery.DefaultDays)
        : IQuery<CatalogStatsOverviewDto>
    {
        public const int DefaultDays = 30;
    }

    public sealed class GetCatalogStatsOverviewQueryHandler
        : IQueryHandler<GetCatalogStatsOverviewQuery, CatalogStatsOverviewDto>
    {
        private const int MaxDays = 365;

        private readonly ICatalogEventRepository _catalogEventRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IProductRepository _productRepository;

        public GetCatalogStatsOverviewQueryHandler(
            ICatalogEventRepository catalogEventRepository,
            IOrderRepository orderRepository,
            IProductRepository productRepository)
        {
            _catalogEventRepository = catalogEventRepository;
            _orderRepository = orderRepository;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<CatalogStatsOverviewDto>> Handle(GetCatalogStatsOverviewQuery query,
            CancellationToken cancellationToken)
        {
            int days = Math.Clamp(query.Days <= 0 ? GetCatalogStatsOverviewQuery.DefaultDays : query.Days, 1, MaxDays);

            // La misma ventana inclusiva de `days` días calendario UTC del panel por tienda.
            DateTime toUtc = DateTime.UtcNow;
            DateTime fromUtc = toUtc.Date.AddDays(-(days - 1));

            CatalogOverviewSnapshot snapshot = await _catalogEventRepository
                .GetOverviewStatsAsync(fromUtc, toUtc, cancellationToken);

            int orders = await _orderRepository.CountOnlineOrdersAsync(fromUtc, toUtc);

            CatalogStatsSnapshot totals = snapshot.Totals;

            Dictionary<CatalogSource, int> visitsBySource = totals.Sources
                .ToDictionary(source => source.Source, source => source.Visits);

            List<CatalogSourceStatsDto> sources = Enum.GetValues<CatalogSource>()
                .Select(source => new CatalogSourceStatsDto(
                    source,
                    visitsBySource.GetValueOrDefault(source)))
                .ToList();

            List<Guid> topProductIds = totals.TopProducts
                .Select(product => product.ProductId)
                .Distinct()
                .ToList();
            IReadOnlyDictionary<Guid, string> productNames = topProductIds.Count == 0
                ? new Dictionary<Guid, string>()
                : await _productRepository.GetNamesByIdsAsync(topProductIds, cancellationToken);

            List<CatalogProductStatsDto> topProducts = totals.TopProducts
                .Select(productViews => new CatalogProductStatsDto(
                    productViews.ProductId,
                    productNames.GetValueOrDefault(productViews.ProductId, string.Empty),
                    productViews.Views))
                .ToList();

            Dictionary<DateTime, int> visitsByDay = totals.Daily
                .ToDictionary(day => day.Day.Date, day => day.Visits);

            var daily = new List<CatalogDayStatsDto>(days);
            for (DateTime day = fromUtc.Date; day <= toUtc.Date; day = day.AddDays(1))
            {
                daily.Add(new CatalogDayStatsDto(day, visitsByDay.GetValueOrDefault(day)));
            }

            double conversionRate = totals.Visits == 0
                ? 0
                : Math.Round((double)orders / totals.Visits, 4);

            return ResponseResult.Success(new CatalogStatsOverviewDto
            {
                Totals = new CatalogStatsDto
                {
                    Days = days,
                    Visits = totals.Visits,
                    Visitors = totals.Visitors,
                    PageViews = totals.PageViews,
                    Orders = orders,
                    ConversionRate = conversionRate,
                    Sources = sources,
                    TopProducts = topProducts,
                    Daily = daily,
                },
                Stores = snapshot.Stores
                    .Select(store => new CatalogStoreStatsDto(store.StoreId, store.Name, store.Visits))
                    .ToList(),
            });
        }
    }
}
