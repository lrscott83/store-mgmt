using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetMySalesManagerCommissions
{
    /// <summary>Comisiones del gestor autenticado, pendientes y pagadas (S3, S9).</summary>
    public sealed record GetMySalesManagerCommissionsQuery : IQuery<List<SalesManagerCommissionDto>>;

    public class GetMySalesManagerCommissionsQueryHandler
        : IQueryHandler<GetMySalesManagerCommissionsQuery, List<SalesManagerCommissionDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly ISalesManagerRepository _salesManagerRepository;
        private readonly IOrderSalesCommissionRepository _orderSalesCommissionRepository;

        public GetMySalesManagerCommissionsQueryHandler(
            IHttpContextService httpContextService,
            ISalesManagerRepository salesManagerRepository,
            IOrderSalesCommissionRepository orderSalesCommissionRepository)
        {
            _httpContextService = httpContextService;
            _salesManagerRepository = salesManagerRepository;
            _orderSalesCommissionRepository = orderSalesCommissionRepository;
        }

        public async Task<ResponseResult<List<SalesManagerCommissionDto>>> Handle(
            GetMySalesManagerCommissionsQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsGestorVentas)
                throw new ApiException("Solo un gestor de ventas puede ver sus comisiones.", HttpStatusCode.Forbidden);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            SalesManager? manager = await _salesManagerRepository.GetByUserIdAsync(userId);
            if (manager is null)
                throw new ApiException("Gestor de ventas no encontrado.", HttpStatusCode.Forbidden);

            IReadOnlyList<OrderSalesCommission> commissions =
                await _orderSalesCommissionRepository.GetBySalesManagerIdAsync(manager.Id);

            List<SalesManagerCommissionDto> result = commissions
                .Select(c => new SalesManagerCommissionDto(
                    c.Id,
                    c.OrderId,
                    c.Order.Code,
                    c.Order.Date,
                    c.StoreId,
                    c.Order.Store.Name,
                    c.OrderItem.Name,
                    c.Quantity,
                    c.Type,
                    c.Value,
                    c.UnitPrice,
                    c.Amount,
                    c.Currency,
                    c.Status,
                    c.PaidAt,
                    c.PaymentNote))
                .OrderByDescending(c => c.OrderDate)
                .ToList();

            return ResponseResult.Success(result);
        }
    }
}
