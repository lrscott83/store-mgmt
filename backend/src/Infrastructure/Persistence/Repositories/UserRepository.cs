using Domain.Entities.Owners;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;
using Domain.Entities.Tenants;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using System.Threading;
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

        public async Task<IEnumerable<User>> GetAllUsersByStoreIdIncludingStoreAndRolesAsync(Guid storeId, bool includeInactive, CancellationToken cancellationToken = default)
        {
            var query = _users
                .Where(u => (includeInactive || u.IsActive)
                    && u.StoreUser != null && u.StoreUser.StoreId == storeId
                    && u.StoreUser.User != null && u.StoreUser.User.IsActive
                    && u.StoreUser.Store != null && u.StoreUser.Store.IsActive 
                    && u.StoreUser.Store.Owner != null && u.StoreUser.Store.Owner.IsActive);

            query = IncludeStoreAndRoles(query);

            return await query.Take(1000).ToListAsync(cancellationToken);
        }

        public async Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(bool includeInactive, CancellationToken cancellationToken = default)
        {
            var query = _users.Where(u => (includeInactive || u.IsActive));

            query = IncludeStoreAndRoles(query);

            return await query.IgnoreQueryFilters().Take(1000).ToListAsync(cancellationToken);
        }

        public async Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAsync(bool includeInactive, CancellationToken cancellationToken = default)
        {
            var query = _users
                .Where(u => (includeInactive || u.IsActive)
                    && u.StoreUser != null && u.StoreUser.IsActive && u.StoreUser.Store.IsActive);

            query = IncludeStoreAndRoles(query);

            return await query.Take(1000).ToListAsync(cancellationToken);
        }

        private IQueryable<User> IncludeStoreAndRoles(IQueryable<User> query)
        {
            return query
                .Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner).ThenInclude(o => o.User)
                .Include(u => u.UserRoles.Where(ur => ur.IsActive && ur.Role.IsActive)).ThenInclude(ur => ur.Role);
        }

        public async Task<User> GetUserByIdIgnoreQueryFiltersAsync(string id)
        {
            return await _users.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id.ToString() == id);
        }

        public async Task<User> GetUserByIdIncludingStoreAndRoles(Guid userId, CancellationToken cancellationToken = default)
        {
            return await IncludeStoreAndRoles(_users.Where(u => u.Id == userId)).FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<User> GetUserByLoginIgnoreQueryFiltersAsync(string login)
        {
            return await _users.Where(user => user.Login == login)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public Task<User?> GetByLoginWithRelatedAsync(string login)
            => GetByLoginWithRelatedAsync(login, default);

        public async Task<User?> GetByLoginWithRelatedAsync(string login, CancellationToken cancellationToken)
        {
            return await _users
                .Where(u => u.Login == login)
                .Include(u => u.ReSeller)
                .Include(u => u.Owner)
                .Include(u => u.StoreUser)
                    .ThenInclude(su => su.Store)
                    .ThenInclude(s => s.Owner)
                    .ThenInclude(o => o.User)
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(cancellationToken);
        }

        public new async Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)
        {
            return await _users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, cancellationToken);
        }

        public async Task<bool> IsUniqueLoginAsync(string login)
        {
            return !await _users.IgnoreQueryFilters().AnyAsync(u => u.Login == login);
        }
    }
}
