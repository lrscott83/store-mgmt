using Domain.Common.Repositories;
using Domain.Entities.Roles;

namespace Domain.Interfaces.Repositories
{
    public interface IRoleRepository : IGenericRepository<Role, int>
    {
        Task<IEnumerable<Role>> GetAllActiveRolesAsync(Guid tenantId, bool includeSuperAdminRole);
        Task<Role> GetRoleByNameAndTenantIdIgnoreQueryFiltersAsync(string name, Guid tenantId);
        Task<IEnumerable<Role>> GetRolesByIds(HashSet<Guid> roleIds);
    }
}
