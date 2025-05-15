using Domain.Entities.StoreUsers;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class StoreUserRepository : GenericRepository<StoreUser>, IStoreUserRepository
    {
        private readonly DbSet<StoreUser> _storeUsers;
        public StoreUserRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storeUsers = dbContext.Set<StoreUser>();
        }

        public async Task<StoreUser> GetStoreUserByIdAsync(Guid userId)
        {
            return await _storeUsers.Where(u => u.UserId == userId).FirstOrDefaultAsync();
        }

        public async Task<StoreUser> GetStoreUserByIdIgnoreQueryFilterAsync(Guid userId)
        {
            return await _storeUsers.Where(u => u.UserId == userId).IgnoreQueryFilters().FirstOrDefaultAsync();
        }

        public async Task<StoreUser> GetStoreUserByUserIdAsync(Guid userId)
        {
            return await _storeUsers
                .Where(su => su.UserId == userId)
                .Include(su => su.Store).ThenInclude(s => s.Owner)
                .Include(su => su.User)
                .FirstOrDefaultAsync();
        }

        public async Task<StoreUser> GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(Guid userId)
        {
            return await _storeUsers
                .Where(su => su.UserId == userId)
                .Include(su => su.Store).ThenInclude(s => s.Owner)
                .Include(su => su.User)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<StoreUser>> GetStoreUsersAsync(bool includeInactive)
        {
            return await _storeUsers.Where(u => includeInactive || u.IsActive)
                .Include(su => su.Store)
                .Include(su => su.User)
                .OrderBy(u => u.Store.Name).ThenBy(u => u.User.FullName)
                .ToListAsync();
        }

        public async Task<IEnumerable<StoreUser>> GetStoreUsersIgnoreQueryFiltersAsync(bool includeInactive)
        {
            return await _storeUsers.Where(u => includeInactive || u.IsActive)
                .Include(su => su.Store)
                .Include(su => su.User)
                .IgnoreQueryFilters()
                .OrderBy(u => u.Store.Name).ThenBy(u => u.User.FullName)
                .ToListAsync();
        }
    }
}
