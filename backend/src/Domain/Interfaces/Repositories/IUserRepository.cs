using Domain.Common.Repositories;
using Domain.Entities.Users;
using System.Threading;

namespace Domain.Interfaces.Repositories
{
    public interface IUserRepository : IGenericRepository<User, Guid>
    {
        Task<User> GetUserByLoginIgnoreQueryFiltersAsync(string login);
        Task<User> GetUserByIdIgnoreQueryFiltersAsync(string id);
        Task<bool> IsUniqueLoginAsync(string login);
        Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(bool includeInactive, CancellationToken cancellationToken = default);
        Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAsync(bool includeInactive, CancellationToken cancellationToken = default);
        Task<IEnumerable<User>> GetAllUsersByStoreIdIncludingStoreAndRolesAsync(Guid storeId, bool includeInactive, CancellationToken cancellationToken = default);
        Task<User> GetUserByIdIncludingStoreAndRoles(Guid userId, CancellationToken cancellationToken = default);
        Task<User?> GetByLoginWithRelatedAsync(string login);
        Task<User?> GetByLoginWithRelatedAsync(string login, CancellationToken cancellationToken);

        new Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);
    }
}
