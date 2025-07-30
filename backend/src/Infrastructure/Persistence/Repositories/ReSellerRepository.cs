using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ReSellerRepository : GenericRepository<ReSeller, Guid>, IReSellerRepository
    {
        private readonly DbSet<ReSeller> _reSellers;
        public ReSellerRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _reSellers = dbContext.Set<ReSeller>();
        }

        public async Task<IEnumerable<ReSeller>> GetAllReSellersIncludingUserAsync(bool includeInactive)
        {
            return await _reSellers
                .Where(o => includeInactive || o.IsActive)
                .Include(o => o.User)
                .IgnoreQueryFilters()
                .ToListAsync();
        }

        public async Task<ReSeller> GetByUserIdIgnoreQueryFiltersAsync(Guid userId)
        {
            return await _reSellers.Where(r => r.UserId == userId)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<ReSeller> GetByUserNameAsync(string code)
        {
            return await _reSellers
                .Where(r => r.User.Login == code)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<ReSeller> GetReSellerIncludingUserByIdAsync(Guid reSellerId)
        {
            return await _reSellers
                .Where (o => o.Id == reSellerId)
                .Include(o => o.User)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();
        }

        public async Task<bool> HasReSellerAnyFeatureAsync(Guid userId, List<StoreRoleFeatures> roleFeatures)
        {
            List<int> roleIds = roleFeatures
                .SelectMany(rf => rf.GetRoles())
                .Select(role => (int)role)
                .ToList();
            return await _reSellers
                .AnyAsync(r => r.IsActive && r.User != null && r.User.IsActive && r.UserId == userId
                    && r.User.UserRoles.Any(ur => ur.IsActive && roleIds.Any(id => id == ur.RoleId)));
        }
    }
}
