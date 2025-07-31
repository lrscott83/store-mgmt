using Domain.Entities.StoreUsages;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreUsageRepository : GenericRepository<StoreUsage, Guid>, IStoreUsageRepository
    {
        private readonly DbSet<StoreUsage> _storeUsages;
        public StoreUsageRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeUsages = dbContext.Set<StoreUsage>();
        }

        public async Task<IEnumerable<StoreUsage>> GetStoreUsageByStoreIdAndUserId(Guid storeId, Guid userId)
        {
            return await _storeUsages
                .Where(usage => usage.StoreId == storeId && usage.UserId == userId)
                .ToListAsync();
        }
    }
}
