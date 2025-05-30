using Domain.Common.Repositories;
using Domain.Entities.Orders;

namespace Domain.Interfaces.Repositories
{
    public interface IOrderRepository : IGenericRepository<Order, Guid>
    {
        
    }
}
