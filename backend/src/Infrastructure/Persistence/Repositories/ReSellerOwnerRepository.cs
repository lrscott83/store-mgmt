using Domain.Entities.ReSellerOwners;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class ReSellerOwnerRepository : GenericRepository<ReSellerOwner>, IReSellerOwnerRepository
    {
        private readonly DbSet<ReSellerOwner> _reSellerOwners;
        public ReSellerOwnerRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _reSellerOwners = dbContext.Set<ReSellerOwner>();
        }

        public async Task<ReSellerOwner> GetByOwnerIdAsync(Guid ownerId)
        {
            return await _reSellerOwners
                .Where(so => so.OwnerId == ownerId)
                .FirstOrDefaultAsync();
        }

        public async Task<IEnumerable<ReSellerOwner>> GetReSellerOwnersByReSellerIdAsync(Guid resellerId, bool includeInactive)
        {
            return await _reSellerOwners
                .Where(s => s.ReSellerId == resellerId && (includeInactive || s.IsActive))
                .Include(s => s.Owner).ThenInclude(o => o.User)
                .ToListAsync();
        }
    }
}
