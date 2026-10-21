using Domain.Common.Repositories;
using Domain.Entities.SalesManagers;

namespace Domain.Interfaces.Repositories
{
    public interface ISalesManagerRepository : IGenericRepository<SalesManager, Guid>
    {
        Task<SalesManager?> GetByUserIdAsync(Guid userId);

        Task<IReadOnlyList<SalesManager>> GetByOwnerIdAsync(Guid ownerId, bool includeInactive = false);
    }
}
