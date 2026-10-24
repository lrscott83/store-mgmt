using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetProductSalesCommissions
{
    public sealed record GetProductSalesCommissionsQuery : IQuery<List<ProductSalesCommissionDto>>;

    /// <summary>Comisiones configuradas en la tienda actual. Owner-only.</summary>
    public class GetProductSalesCommissionsQueryHandler
        : IQueryHandler<GetProductSalesCommissionsQuery, List<ProductSalesCommissionDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IProductSalesCommissionRepository _commissionRepository;

        public GetProductSalesCommissionsQueryHandler(
            IHttpContextService httpContextService,
            IProductSalesCommissionRepository commissionRepository)
        {
            _httpContextService = httpContextService;
            _commissionRepository = commissionRepository;
        }

        public async Task<ResponseResult<List<ProductSalesCommissionDto>>> Handle(
            GetProductSalesCommissionsQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede ver las comisiones.", HttpStatusCode.Forbidden);

            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException("Tienda no seleccionada.", HttpStatusCode.BadRequest);

            IReadOnlyList<ProductSalesCommission> commissions =
                await _commissionRepository.GetByStoreIdAsync(storeId);

            return ResponseResult.Success(commissions
                .Select(c => new ProductSalesCommissionDto(c.ProductId, c.Type, c.Value, c.Currency))
                .ToList());
        }
    }
}
