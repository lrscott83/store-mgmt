using Domain.Common.Repositories;
using Domain.Entities.Users;

namespace Domain.Interfaces.Repositories
{
    public interface IUserRepository : IGenericRepository<User, Guid>
    {
        Task<User> GetUserByLoginIgnoreQueryFiltersAsync(string login);
        Task<User> GetUserByIdIgnoreQueryFiltersAsync(string id);
        Task<bool> IsUniqueLoginAsync(string login);
        Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(bool includeInactive);
        Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAsync(bool includeInactive);
        Task<IEnumerable<User>> GetAllUsersByStoreIdIncludingStoreAndRolesAsync(Guid storeId, bool includeInactive);
        Task<User> GetUserByIdIncludingStoreAndRoles(Guid userId);
        Task<User?> GetByLoginWithRelatedAsync(string login);
    }
}
