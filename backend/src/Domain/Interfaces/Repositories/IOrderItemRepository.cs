using Domain.Common.Repositories;
using Domain.Entities.OrderItems;

namespace Domain.Interfaces.Repositories
{
    public interface IOrderItemRepository : IGenericRepository<OrderItem, Guid>
    {
        
    }
}
