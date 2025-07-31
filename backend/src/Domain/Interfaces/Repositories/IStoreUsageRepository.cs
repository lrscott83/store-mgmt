using Domain.Common.Repositories;
using Domain.Entities.StoreUsages;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreUsageRepository : IGenericRepository<StoreUsage, Guid>
    {
        Task<IEnumerable<StoreUsage>> GetStoreUsageByStoreIdAndUserId(Guid storeId, Guid userId);
    }
}
