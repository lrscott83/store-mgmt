using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.OrderSalesCommissions;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetOwnerSalesCommissions
{
    /// <summary>
    /// Comisiones de TODOS los gestores del Owner autenticado, con filtros opcionales por estado
    /// y por gestor (S7/S9). Solo el Owner las ve; el gestor usa su propio portal.
    /// </summary>
    public sealed record GetOwnerSalesCommissionsQuery(
        SalesCommissionStatus? Status,
        Guid? SalesManagerId) : IQuery<List<OwnerSalesCommissionDto>>;

    public class GetOwnerSalesCommissionsQueryHandler
        : IQueryHandler<GetOwnerSalesCommissionsQuery, List<OwnerSalesCommissionDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IOrderSalesCommissionRepository _commissionRepository;

        public GetOwnerSalesCommissionsQueryHandler(
            IHttpContextService httpContextService,
            IOwnerRepository ownerRepository,
            IOrderSalesCommissionRepository commissionRepository)
        {
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _commissionRepository = commissionRepository;
        }

        public async Task<ResponseResult<List<OwnerSalesCommissionDto>>> Handle(
            GetOwnerSalesCommissionsQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException(
                    "Solo el Owner puede ver las comisiones de sus gestores.",
                    HttpStatusCode.Forbidden);

            Guid ownerUserId = _httpContextService.UserExternalId.ToGuid();
            Owner? owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(ownerUserId);
            if (owner is null || !owner.IsActive)
                throw new ApiException("Owner no encontrado.", HttpStatusCode.Forbidden);

            IReadOnlyList<OrderSalesCommission> commissions =
                await _commissionRepository.GetByOwnerIdAsync(owner.Id, request.Status);

            IEnumerable<OrderSalesCommission> filtered = request.SalesManagerId.HasValue
                ? commissions.Where(c => c.SalesManagerId == request.SalesManagerId.Value)
                : commissions;

            List<OwnerSalesCommissionDto> result = filtered
                // Las filas con navegaciones ausentes (p. ej. un usuario/orden soft-deleted) se
                // omiten: es preferible perder una fila a tumbar todo el cobro con un 500.
                .Where(c => c.Order is not null && c.OrderItem is not null)
                .Select(c => new OwnerSalesCommissionDto(
                    c.Id,
                    c.SalesManagerId,
                    c.SalesManager?.User?.FullName ?? string.Empty,
                    c.SalesManager?.User?.Login ?? string.Empty,
                    c.OrderId,
                    c.Order.Code,
                    c.Order.Date,
                    c.StoreId,
                    c.Order.Store?.Name ?? string.Empty,
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
                // Pendientes primero (es lo que el Owner tiene que pagar), luego lo más reciente.
                .OrderBy(c => c.Status)
                .ThenByDescending(c => c.OrderDate)
                .ToList();

            return ResponseResult.Success(result);
        }
    }
}
