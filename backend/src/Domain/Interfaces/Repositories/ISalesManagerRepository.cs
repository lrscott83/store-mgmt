using Domain.Common.Repositories;
using Domain.Entities.SalesManagers;

namespace Domain.Interfaces.Repositories
{
    public interface ISalesManagerRepository : IGenericRepository<SalesManager, Guid>
    {
        Task<SalesManager?> GetByUserIdAsync(Guid userId, bool includeInactive = false);

        Task<IReadOnlyList<SalesManager>> GetByOwnerIdAsync(Guid ownerId, bool includeInactive = false);
    }
}
