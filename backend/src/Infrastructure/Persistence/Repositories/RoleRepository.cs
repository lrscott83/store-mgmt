using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Roles;
using Domain.Entities.Tenants;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class RoleRepository : GenericRepository<Role, int>, IRoleRepository
    {
        private readonly DbSet<Role> _roles;
        public RoleRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _roles = dbContext.Set<Role>();
        }

        public async Task<IEnumerable<Role>> GetAllActiveRolesAsync(Guid tenantId, bool includeSuperAdminRole)
        {
            return await _roles
                .IgnoreQueryFilters()
                .Where(r => r.IsActive &&
                    (r.Id != (int)RoleType.SuperAdmin || includeSuperAdminRole))
                .ToListAsync();
        }

        public async Task<Role> GetRoleByNameAndTenantIdIgnoreQueryFiltersAsync(string name, Guid tenantId)
        {
            return await _roles
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(r => r.Name == name);
        }

        public async Task<IEnumerable<Role>> GetRolesByIds(HashSet<int> roleIds)
        {
            return await _roles
                .IgnoreQueryFilters()
                .Where(r => roleIds.Contains(r.Id))
                .ToListAsync();
        }
    }
}
