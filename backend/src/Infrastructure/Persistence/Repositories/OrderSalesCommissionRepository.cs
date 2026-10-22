using Domain.Common.Enums;
using Domain.Entities.OrderSalesCommissions;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OrderSalesCommissionRepository
        : GenericRepository<OrderSalesCommission, Guid>, IOrderSalesCommissionRepository
    {
        private readonly DbSet<OrderSalesCommission> _commissions;

        public OrderSalesCommissionRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _commissions = dbContext.Set<OrderSalesCommission>();
        }

        /// <summary>
        /// La idempotencia la garantiza el índice único de `OrderItemId`; esta lectura evita el
        /// trabajo de recalcular. `IgnoreQueryFilters` porque un reintento puede llegar sin tenant
        /// y el `OrderItemId` es único global.
        /// </summary>
        public Task<OrderSalesCommission?> GetByOrderItemIdAsync(Guid orderItemId)
            => _commissions
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.OrderItemId == orderItemId);

        public async Task<IReadOnlyList<OrderSalesCommission>> GetBySalesManagerIdAsync(
            Guid salesManagerId,
            SalesCommissionStatus? status = null)
        {
            IQueryable<OrderSalesCommission> query = _commissions
                .Include(x => x.OrderItem)
                .Include(x => x.Order)
                    .ThenInclude(o => o.Store)
                .Where(x => x.SalesManagerId == salesManagerId);

            if (status.HasValue)
                query = query.Where(x => x.Status == status.Value);

            return await query.ToListAsync();
        }

        public async Task<IReadOnlyList<OrderSalesCommission>> GetByOwnerIdAsync(
            Guid ownerId,
            SalesCommissionStatus? status = null)
        {
            IQueryable<OrderSalesCommission> query = _commissions
                .Include(x => x.OrderItem)
                .Include(x => x.Order)
                    .ThenInclude(o => o.Store)
                .Include(x => x.SalesManager)
                    .ThenInclude(s => s.User)
                .Where(x => x.OwnerId == ownerId);

            if (status.HasValue)
                query = query.Where(x => x.Status == status.Value);

            return await query.ToListAsync();
        }
    }
}
