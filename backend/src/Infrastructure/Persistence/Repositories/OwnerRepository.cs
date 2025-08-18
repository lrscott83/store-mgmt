using Domain.Entities.Owners;
using Domain.Entities.ReSellers;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
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

        public async Task<IEnumerable<Owner>> GetAllOwnersIncludingStoreModulesAsync(bool includeInactive)
        {
            return await _owners
                .Where(o => includeInactive || o.IsActive)
                .Include(o => o.User)
                .Include(o => o.Stores.Where(s => includeInactive || s.IsActive)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))
                .Include(o => o.ReSellerOwner).ThenInclude(ro => ro.ReSeller).ThenInclude(r => r.User)
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
                .Where(o => o.Id == ownerId)
                .Include(o => o.User)
                .Include(o => o.ReSellerOwner)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<Owner> GetOwnerWithAllDataToDeleteByIdAsync(Guid ownerId)
        {
            return await _owners.Where(o => o.Id == ownerId)
                .Include(o => o.User).ThenInclude(u => u.UserRoles)
                .Include(o => o.Stores).ThenInclude(s => s.StoreUsers).ThenInclude(su => su.User)
                .Include(o => o.Stores).ThenInclude(s => s.StoreModules)
                .Include(o => o.Stores).ThenInclude(s => s.StoreRoleFeatures)
                .Include(o => o.Stores).ThenInclude(s => s.StoreUsages)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<Owner>> GetReSellerOwnersIncludingStoreModulesAsync(Guid reSellerId, bool includeInactive)
        {
            return await _owners
                .Where(o => o.ReSellerOwner != null && o.ReSellerOwner.ReSeller != null && o.ReSellerOwner.ReSeller.UserId == reSellerId && (includeInactive || o.IsActive))
                .Include(o => o.User)
                .Include(o => o.Stores.Where(s => includeInactive || s.IsActive)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))
                .IgnoreQueryFilters()
                .ToListAsync();
        }
    }
}
