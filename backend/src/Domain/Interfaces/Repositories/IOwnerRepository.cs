using Domain.Common.Repositories;
using Domain.Entities.Owners;

namespace Domain.Interfaces.Repositories
{
    public interface IOwnerRepository : IGenericRepository<Owner, Guid>
    {
        Task<IEnumerable<Owner>> GetAllOwnersIncludingStoreModulesAsync(bool includeInactive);
        Task<IEnumerable<Owner>> GetReSellerOwnersIncludingStoreModulesAsync(Guid reSellerId, bool includeInactive);
        Task<Owner> GetOwnerIncludingUserByIdAsync(Guid ownerId);
        Task<Owner> GetByUserIdIgnoreQueryFiltersAsync(Guid userId);
        Task<Owner> GetOwnerWithAllDataToDeleteByIdAsync(Guid id);
    }
}
