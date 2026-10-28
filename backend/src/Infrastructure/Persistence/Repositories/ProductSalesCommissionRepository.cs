using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductSalesCommissionRepository
        : GenericRepository<ProductSalesCommission, Guid>, IProductSalesCommissionRepository
    {
        private readonly DbSet<ProductSalesCommission> _commissions;

        public ProductSalesCommissionRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _commissions = dbContext.Set<ProductSalesCommission>();
        }

        public Task<ProductSalesCommission?> GetByProductIdAsync(Guid productId)
            => _commissions.FirstOrDefaultAsync(x => x.ProductId == productId);

        public async Task<IReadOnlyList<ProductSalesCommission>> GetByStoreIdAsync(Guid storeId)
            => await _commissions
                .Where(x => x.StoreId == storeId)
                .ToListAsync();
    }
}
