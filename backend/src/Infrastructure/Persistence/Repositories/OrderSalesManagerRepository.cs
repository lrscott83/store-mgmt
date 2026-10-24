using Domain.Entities.OrderSalesManagers;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OrderSalesManagerRepository
        : GenericRepository<OrderSalesManager, Guid>, IOrderSalesManagerRepository
    {
        private readonly DbSet<OrderSalesManager> _attributions;

        public OrderSalesManagerRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _attributions = dbContext.Set<OrderSalesManager>();
        }

        /// <summary>La unicidad real la garantiza el índice único de `OrderId`.</summary>
        public Task<OrderSalesManager?> GetByOrderIdAsync(Guid orderId)
            => _attributions
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.OrderId == orderId);

        public async Task<IReadOnlyList<OrderSalesManager>> GetBySalesManagerIdAsync(Guid salesManagerId)
            => await _attributions
                .Include(x => x.Order)
                    .ThenInclude(o => o.Store)
                .Where(x => x.SalesManagerId == salesManagerId)
                .ToListAsync();
    }
}
