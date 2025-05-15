using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using System.Xml.Linq;

namespace Infrastructure.Persistence.Repositories
{
    public class UserRepository : GenericRepository<User, Guid>, IUserRepository
    {
        private readonly DbSet<User> _users;
        public UserRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _users = dbContext.Set<User>();
        }

        public async Task<IEnumerable<User>> GetAllUsersByStoreIdIncludingStoreAndRolesAsync(Guid storeId, bool includeInactive)
        {
            return await _users
                .Where(u => (includeInactive || u.IsActive)
                    && u.StoreUser != null && u.StoreUser.StoreId == storeId
                    && u.StoreUser.User != null && u.StoreUser.User.IsActive
                    && u.StoreUser.Store != null && u.StoreUser.Store.IsActive 
                    && u.StoreUser.Store.Owner != null && u.StoreUser.Store.Owner.IsActive)
                .Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner)
                .Include(u => u.UserRoles.Where(ur => ur.IsActive && ur.Role.IsActive)).ThenInclude(ur => ur.Role)
                .ToListAsync();
        }

        public async Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(bool includeInactive)
        {
            return await _users
                .Where(u => (includeInactive || u.IsActive))
                .Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner)
                .Include(u => u.UserRoles.Where(ur => ur.IsActive && ur.Role.IsActive)).ThenInclude(ur => ur.Role)
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAsync(bool includeInactive)
        {
            return await _users
                .Where(u => (includeInactive || u.IsActive)
                    && u.StoreUser != null && u.StoreUser.IsActive && u.StoreUser.Store.IsActive)
                .Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner)
                .Include(u => u.UserRoles.Where(ur => ur.IsActive && ur.Role.IsActive)).ThenInclude(ur => ur.Role)
                .ToListAsync();
        }

        public async Task<User> GetUserByIdIgnoreQueryFiltersAsync(string id)
        {
            return await _users.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id.ToString() == id);
        }

        public async Task<User> GetUserByIdIncludingStoreAndRoles(Guid userId)
        {
            return await _users
                .Where(u => u.Id == userId)
                .Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner)
                .Include(u => u.UserRoles.Where(ur => ur.IsActive && ur.Role.IsActive)).ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync();
        }

        public async Task<User> GetUserByLoginIgnoreQueryFiltersAsync(string login)
        {
            return await _users.Where(user => user.Login == login)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<bool> IsUniqueLoginAsync(string login)
        {
            return await Task.FromResult(_users.All(t => t.Login != login));
        }
    }
}
