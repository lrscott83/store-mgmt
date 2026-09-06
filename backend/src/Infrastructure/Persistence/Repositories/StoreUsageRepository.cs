using Application.Dtos.Management.Usages;
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

        public async Task<IEnumerable<StoreUsage>> GetStoresUsagesAfterDateAsync(DateTime day)
        {
            return await _storeUsages.Where(usage => usage.Day >= day && usage.Store.IsActive)
                .GroupBy(usage => new { usage.StoreId, usage.Day })
                .Select(group => group.First())
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreUsage>> GetStoresUsagesAfterDateWithOwnerAsync(DateTime day)
        {
            // Deduplicated per (StoreId, Day) by the caller AFTER projection, so the
            // navigation chain Store → Owner → User stays loaded (a SQL GROUP BY with
            // Includes would silently drop them under NoTracking).
            return await _storeUsages
                .Include(usage => usage.Store)
                    .ThenInclude(store => store.Owner)
                        .ThenInclude(owner => owner.User)
                .Where(usage => usage.Day >= day && usage.Store.IsActive)
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreUsage>> GetStoreUsageByStoreIdAndUserId(Guid storeId, Guid userId)
        {
            return await _storeUsages
                .Where(usage => usage.StoreId == storeId && usage.UserId == userId)
                .ToListAsync();
        }
    }
}
