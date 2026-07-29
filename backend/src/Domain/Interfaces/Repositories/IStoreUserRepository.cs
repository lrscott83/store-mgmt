using Domain.Common.Repositories;
using Domain.Entities.Stores;
using Domain.Entities.StoreUsers;

namespace Domain.Interfaces.Repositories
{
    public interface IStoreUserRepository : IGenericRepository<StoreUser>
    {
        Task<StoreUser> GetStoreUserByIdAsync(Guid storeUserId);
        Task<StoreUser> GetStoreUserByIdIgnoreQueryFilterAsync(Guid storeUserId);
        Task<StoreUser> GetStoreUserByUserIdAsync(Guid userId);
        Task<StoreUser> GetStoreUserByUserIdAndIgnoreQueryFiltersAsync(Guid userId);
        Task<IEnumerable<StoreUser>> GetStoreUsersAsync(bool includeInactive);
        Task<IEnumerable<StoreUser>> GetStoreUsersIgnoreQueryFiltersAsync(bool includeInactive);
        Task<IEnumerable<StoreUser>> GetStoreUsersByStoreIdAsync(Guid storeId, bool includeInactive);
    }
}
