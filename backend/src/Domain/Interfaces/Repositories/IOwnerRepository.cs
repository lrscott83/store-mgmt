using Domain.Common.Repositories;
using Domain.Entities.Owners;

namespace Domain.Interfaces.Repositories
{
    public interface IOwnerRepository : IGenericRepository<Owner, Guid>
    {
        Task<IEnumerable<Owner>> GetAllOwnersIncludingStoreModulesAsync(bool includeInactive, CancellationToken cancellationToken = default);
        Task<IEnumerable<Owner>> GetReSellerOwnersIncludingStoreModulesAsync(Guid reSellerId, bool includeInactive, CancellationToken cancellationToken = default);
        Task<Owner> GetOwnerIncludingUserByIdAsync(Guid ownerId, CancellationToken cancellationToken = default);
        Task<Owner> GetOwnerWithUserTrackedAsync(Guid ownerId, CancellationToken cancellationToken = default);
        Task<Owner> GetByUserIdIgnoreQueryFiltersAsync(Guid userId);
        Task<Owner> GetOwnerWithAllDataToDeleteByIdAsync(Guid id);
    }
}
