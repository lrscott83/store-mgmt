using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.OrderSalesCommissions;

namespace Domain.Interfaces.Repositories
{
    public interface IOrderSalesCommissionRepository
        : IGenericRepository<OrderSalesCommission, Guid>
    {
        /// <summary>Idempotencia de la generación: `OrderItemId` es único en la base.</summary>
        Task<OrderSalesCommission?> GetByOrderItemIdAsync(Guid orderItemId);

        Task<IReadOnlyList<OrderSalesCommission>> GetBySalesManagerIdAsync(
            Guid salesManagerId,
            SalesCommissionStatus? status = null);

        Task<IReadOnlyList<OrderSalesCommission>> GetByOwnerIdAsync(
            Guid ownerId,
            SalesCommissionStatus? status = null);
    }
}
