using Domain.Entities.OrderItems;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OrderItemRepository : GenericRepository<OrderItem, Guid>, IOrderItemRepository
    {
        private readonly DbSet<OrderItem> _orderItems;
        public OrderItemRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _orderItems = dbContext.Set<OrderItem>();
        }
    }
}
