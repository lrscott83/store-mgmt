using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.ResponseModels;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog.Queries.GetCatalogStats
{
    /// <summary>
    /// Estadísticas del catálogo de una tienda. Endpoint SuperAdmin: no se expone al dueño.
    /// El panel GENERAL (todas las tiendas) vive en `GetCatalogStatsOverview`.
    /// </summary>
    public sealed record GetCatalogStatsQuery(Guid StoreId, int Days = GetCatalogStatsQuery.DefaultDays) : IQuery<CatalogStatsDto>
    {
        public const int DefaultDays = CatalogStatsComposition.DefaultDays;
    }

    public sealed class GetCatalogStatsQueryHandler : IQueryHandler<GetCatalogStatsQuery, CatalogStatsDto>
    {
        private readonly ICatalogEventRepository _catalogEventRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IProductRepository _productRepository;

        public GetCatalogStatsQueryHandler(
            ICatalogEventRepository catalogEventRepository,
            IOrderRepository orderRepository,
            IProductRepository productRepository)
        {
            _catalogEventRepository = catalogEventRepository;
            _orderRepository = orderRepository;
            _productRepository = productRepository;
        }

        public async Task<ResponseResult<CatalogStatsDto>> Handle(GetCatalogStatsQuery query,
            CancellationToken cancellationToken)
        {
            int days = CatalogStatsComposition.ResolveDays(query.Days);
            (DateTime fromUtc, DateTime toUtc) = CatalogStatsComposition.ResolveWindow(days);

            CatalogStatsSnapshot snapshot = await _catalogEventRepository
                .GetStatsAsync(query.StoreId, fromUtc, toUtc, cancellationToken);

            int orders = await _orderRepository
                .CountOnlineOrdersAsync(query.StoreId, fromUtc, toUtc);

            List<Guid> topProductIds = snapshot.TopProducts
                .Select(product => product.ProductId)
                .Distinct()
                .ToList();
            IReadOnlyDictionary<Guid, string> productNames = topProductIds.Count == 0
                ? new Dictionary<Guid, string>()
                : await _productRepository.GetNamesByIdsAsync(topProductIds, cancellationToken);

            List<CatalogProductStatsDto> topProducts = snapshot.TopProducts
                .Select(productViews => new CatalogProductStatsDto(
                    productViews.ProductId,
                    productNames.GetValueOrDefault(productViews.ProductId, string.Empty),
                    productViews.Views))
                .ToList();

            return ResponseResult.Success(new CatalogStatsDto
            {
                Days = days,
                Visits = snapshot.Visits,
                Visitors = snapshot.Visitors,
                PageViews = snapshot.PageViews,
                Orders = orders,
                ConversionRate = CatalogStatsComposition.ConversionRate(snapshot.Visits, orders),
                Sources = CatalogStatsComposition.DenseSources(snapshot),
                TopProducts = topProducts,
                Daily = CatalogStatsComposition.DenseDaily(snapshot.Daily, fromUtc, toUtc),
            });
        }
    }
}
