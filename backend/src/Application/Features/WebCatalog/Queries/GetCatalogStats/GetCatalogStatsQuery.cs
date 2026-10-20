using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;

namespace Application.Features.WebCatalog.Queries.GetCatalogStats
{
    /// <summary>
    /// Estadísticas del catálogo de una tienda. Endpoint SuperAdmin: no se expone al dueño.
    /// </summary>
    public sealed record GetCatalogStatsQuery(Guid StoreId, int Days = 30) : IQuery<CatalogStatsDto>;

    public sealed class GetCatalogStatsQueryHandler : IQueryHandler<GetCatalogStatsQuery, CatalogStatsDto>
    {
        private const int DefaultDays = 30;
        private const int MaxDays = 365;

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
            int days = Math.Clamp(query.Days <= 0 ? DefaultDays : query.Days, 1, MaxDays);

            // Ventana inclusiva de `days` días calendario UTC, terminando hoy. El evento y el
            // pedido usan el mismo rango, para que la conversión no mezcle peras con manzanas.
            DateTime toUtc = DateTime.UtcNow;
            DateTime fromUtc = toUtc.Date.AddDays(-(days - 1));

            CatalogStatsSnapshot snapshot = await _catalogEventRepository
                .GetStatsAsync(query.StoreId, fromUtc, toUtc, cancellationToken);

            int orders = await _orderRepository
                .CountOnlineOrdersAsync(query.StoreId, fromUtc, toUtc);

            Dictionary<CatalogSource, int> visitsBySource = snapshot.Sources
                .ToDictionary(source => source.Source, source => source.Visits);

            List<CatalogSourceStatsDto> sources = Enum.GetValues<CatalogSource>()
                .Select(source => new CatalogSourceStatsDto(
                    source,
                    visitsBySource.GetValueOrDefault(source)))
                .ToList();

            var topProducts = new List<CatalogProductStatsDto>(snapshot.TopProducts.Count);
            foreach (CatalogProductViews productViews in snapshot.TopProducts)
            {
                Product? product = await _productRepository.GetByIdAsync(productViews.ProductId);
                topProducts.Add(new CatalogProductStatsDto(
                    productViews.ProductId,
                    product?.Name ?? string.Empty,
                    productViews.Views));
            }

            Dictionary<DateTime, int> visitsByDay = snapshot.Daily
                .ToDictionary(day => day.Day.Date, day => day.Visits);

            var daily = new List<CatalogDayStatsDto>(days);
            for (DateTime day = fromUtc.Date; day <= toUtc.Date; day = day.AddDays(1))
            {
                daily.Add(new CatalogDayStatsDto(day, visitsByDay.GetValueOrDefault(day)));
            }

            double conversionRate = snapshot.Visits == 0
                ? 0
                : Math.Round((double)orders / snapshot.Visits, 4);

            return ResponseResult.Success(new CatalogStatsDto
            {
                Days = days,
                Visits = snapshot.Visits,
                Visitors = snapshot.Visitors,
                PageViews = snapshot.PageViews,
                Orders = orders,
                ConversionRate = conversionRate,
                Sources = sources,
                TopProducts = topProducts,
                Daily = daily,
            });
        }
    }
}
