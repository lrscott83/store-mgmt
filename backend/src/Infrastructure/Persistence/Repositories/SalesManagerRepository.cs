using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class SalesManagerRepository : GenericRepository<SalesManager, Guid>, ISalesManagerRepository
    {
        private readonly DbSet<SalesManager> _salesManagers;

        public SalesManagerRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _salesManagers = dbContext.Set<SalesManager>();
        }

        /// <summary>
        /// Resolución por usuario para login/claims. `IgnoreQueryFilters` porque el login no
        /// siempre trae tenant en el contexto y el `UserId` es único.
        /// </summary>
        public Task<SalesManager?> GetByUserIdAsync(Guid userId, bool includeInactive = false)
            => _salesManagers
                .Include(x => x.User)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(x => x.UserId == userId && (includeInactive || x.IsActive));

        public async Task<IReadOnlyList<SalesManager>> GetByOwnerIdAsync(Guid ownerId, bool includeInactive = false)
            => await _salesManagers
                .Include(x => x.User)
                .Where(x => x.OwnerId == ownerId && (includeInactive || x.IsActive))
                .ToListAsync();
    }
}
