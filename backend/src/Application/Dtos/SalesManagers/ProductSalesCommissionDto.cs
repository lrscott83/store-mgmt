using Domain.Common.Enums;

namespace Application.Dtos.SalesManagers
{
    public sealed record ProductSalesCommissionDto(
        Guid ProductId,
        SalesCommissionType Type,
        decimal Value,
        Currency Currency);
}
