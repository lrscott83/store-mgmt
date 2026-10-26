using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog.Queries.GetCatalogStatsOverview
{
    /// <summary>
    /// Estadísticas del catálogo de TODAS las tiendas. Endpoint SuperAdmin: es la vista general del
    /// panel, y devuelve además las tiendas con visitas en el periodo para alimentar el selector.
    ///
    /// <para><b>Semántica del agregado.</b> `VisitorHash` se calcula por tienda + día + IP + UA y
    /// `SessionHash` incluye la tienda, así que el número global es exactamente la SUMA de los
    /// únicos por tienda: una misma persona que entra a dos tiendas cuenta en las dos. Eso es lo que
    /// mide el panel general y está documentado para no prometer un "único de plataforma" que el
    /// hash no puede calcular.</para>
    /// </summary>
    public sealed record GetCatalogStatsOverviewQuery(int Days = GetCatalogStatsOverviewQuery.DefaultDays)
        : IQuery<CatalogStatsOverviewDto>
    {
        public const int DefaultDays = CatalogStatsComposition.DefaultDays;
    }

    public sealed class GetCatalogStatsOverviewQueryHandler
        : IQueryHandler<GetCatalogStatsOverviewQuery, CatalogStatsOverviewDto>
    {
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
            int days = CatalogStatsComposition.ResolveDays(query.Days);
            (DateTime fromUtc, DateTime toUtc) = CatalogStatsComposition.ResolveWindow(days);

            CatalogOverviewSnapshot snapshot = await _catalogEventRepository
                .GetOverviewStatsAsync(fromUtc, toUtc, cancellationToken);

            int orders = await _orderRepository.CountOnlineOrdersAsync(fromUtc, toUtc);

            CatalogStatsSnapshot totals = snapshot.Totals;

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

            return ResponseResult.Success(new CatalogStatsOverviewDto
            {
                Totals = new CatalogStatsDto
                {
                    Days = days,
                    Visits = totals.Visits,
                    Visitors = totals.Visitors,
                    PageViews = totals.PageViews,
                    Orders = orders,
                    ConversionRate = CatalogStatsComposition.ConversionRate(totals.Visits, orders),
                    Sources = CatalogStatsComposition.DenseSources(totals),
                    TopProducts = topProducts,
                    Daily = CatalogStatsComposition.DenseDaily(totals.Daily, fromUtc, toUtc),
                },
                Stores = snapshot.Stores
                    .Select(store => new CatalogStoreStatsDto(store.StoreId, store.Name, store.Visits))
                    .ToList(),
            });
        }
    }
}
