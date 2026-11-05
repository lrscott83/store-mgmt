using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ProductWholesaleTierRepository
        : GenericRepository<ProductWholesaleTier, Guid>, IProductWholesaleTierRepository
    {
        private readonly DbSet<ProductWholesaleTier> _tiers;

        public ProductWholesaleTierRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _tiers = dbContext.Set<ProductWholesaleTier>();
        }

        public async Task<IList<ProductWholesaleTier>> GetByProductIdAsync(Guid productId)
        {
            return await _tiers
                .Where(tier => tier.ProductId == productId)
                .OrderBy(tier => tier.MinPacks)
                .ToListAsync();
        }
    }
}
