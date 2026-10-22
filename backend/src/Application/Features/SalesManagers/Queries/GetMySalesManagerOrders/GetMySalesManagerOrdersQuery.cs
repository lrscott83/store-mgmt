using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.OrderSalesManagers;
using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetMySalesManagerOrders
{
    /// <summary>Pedidos atribuidos al gestor autenticado (S3).</summary>
    public sealed record GetMySalesManagerOrdersQuery : IQuery<List<SalesManagerOrderDto>>;

    public class GetMySalesManagerOrdersQueryHandler
        : IQueryHandler<GetMySalesManagerOrdersQuery, List<SalesManagerOrderDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly ISalesManagerRepository _salesManagerRepository;
        private readonly IOrderSalesManagerRepository _orderSalesManagerRepository;

        public GetMySalesManagerOrdersQueryHandler(
            IHttpContextService httpContextService,
            ISalesManagerRepository salesManagerRepository,
            IOrderSalesManagerRepository orderSalesManagerRepository)
        {
            _httpContextService = httpContextService;
            _salesManagerRepository = salesManagerRepository;
            _orderSalesManagerRepository = orderSalesManagerRepository;
        }

        public async Task<ResponseResult<List<SalesManagerOrderDto>>> Handle(
            GetMySalesManagerOrdersQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsGestorVentas)
                throw new ApiException("Solo un gestor de ventas puede ver sus pedidos.", HttpStatusCode.Forbidden);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            SalesManager? manager = await _salesManagerRepository.GetByUserIdAsync(userId);
            if (manager is null)
                throw new ApiException("Gestor de ventas no encontrado.", HttpStatusCode.Forbidden);

            IReadOnlyList<OrderSalesManager> attributions =
                await _orderSalesManagerRepository.GetBySalesManagerIdAsync(manager.Id);

            List<SalesManagerOrderDto> orders = attributions
                .Select(a => new SalesManagerOrderDto(
                    a.Order.Id,
                    a.Order.Code,
                    a.Order.StoreId,
                    a.Order.Store.Name,
                    a.Order.Status,
                    a.Order.Date,
                    a.Order.Total,
                    a.Order.Currency,
                    a.Order.ItemsCount))
                .OrderByDescending(o => o.Date)
                .ToList();

            return ResponseResult.Success(orders);
        }
    }
}
