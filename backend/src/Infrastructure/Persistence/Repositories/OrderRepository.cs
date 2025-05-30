using Domain.Entities.Orders;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OrderRepository : GenericRepository<Order, Guid>, IOrderRepository
    {
        private readonly DbSet<Order> _orders;
        public OrderRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _orders = dbContext.Set<Order>();
        }
    }
}
