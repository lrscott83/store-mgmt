using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Tenants;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class OwnerRepository : GenericRepository<Owner, Guid>, IOwnerRepository
    {
        private readonly DbSet<Owner> _owners;
        public OwnerRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _owners = dbContext.Set<Owner>();
        }

        public async Task<IEnumerable<Owner>> GetAllOwnersIncludingStoreModulesAsync(bool IncludeInactive)
        {
            return await _owners
                .Where(o => IncludeInactive || o.IsActive)
                .Include(o => o.User)
                .Include(o => o.Stores.Where(s => s.IsActive && s.Approved)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<Owner> GetByUserIdIgnoreQueryFiltersAsync(Guid userId)
        {
            return await _owners.Where(r => r.UserId == userId)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<Owner> GetOwnerIncludingUserByIdAsync(Guid ownerId)
        {
            return await _owners
                .Where (o => o.Id == ownerId)
                .Include(o => o.User)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Owner>> GetReSellerOwnersIncludingStoreModulesAsync(Guid reSellerId, bool includeInactive)
        {
            return await _owners
                .Where(o => o.ReSellerOwner != null && o.ReSellerOwner.ReSellerId == reSellerId && (includeInactive || o.IsActive))
                .Include(o => o.User)
                .Include(o => o.Stores.Where(s => s.IsActive && s.Approved)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))
                .IgnoreQueryFilters()
                .ToListAsync();
        }
    }
}
