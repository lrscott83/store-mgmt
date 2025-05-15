using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.UserRoles;

namespace Domain.Interfaces.Repositories
{
    public interface IUserRoleRepository : IGenericRepository<UserRole>
    {
        //Task<bool> HasPermission(Guid userId, FeatureType[] featureTypes);
        Task<bool> IsSuperAdmin(Guid userId);
        Task<bool> IsStoreAdmin(Guid userId);
        Task<bool> IsReSeller(Guid userId);
        Task<IReadOnlyCollection<int>> GetUserFeatureIdsForClaims(Guid userId, Guid storeId);
        Task<IEnumerable<int>> GetActiveRoleIdsByUser(Guid userId);
        Task<IEnumerable<UserRole>> GetActiveUserRolesByIds(Guid userId, HashSet<int> roleIds);
    }
}
