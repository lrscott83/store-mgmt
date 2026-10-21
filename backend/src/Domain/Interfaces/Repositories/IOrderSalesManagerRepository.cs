using Domain.Common.Repositories;
using Domain.Entities.OrderSalesManagers;

namespace Domain.Interfaces.Repositories
{
    public interface IOrderSalesManagerRepository : IGenericRepository<OrderSalesManager, Guid>
    {
        Task<OrderSalesManager?> GetByOrderIdAsync(Guid orderId);

        Task<IReadOnlyList<OrderSalesManager>> GetBySalesManagerIdAsync(Guid salesManagerId);
    }
}
