using Application.Abstractions.HttpContext;
using Application.Abstractions.Roles;
using Domain.Common.Utils;
using Domain.Interfaces.Repositories;

namespace Application.Services.Roles
{
    public class VisibleRoleService : IVisibleRoleService
    {
        private readonly IRoleRepository _roleRepository;
        private readonly IHttpContextService _httpContextService;
        public VisibleRoleService(IRoleRepository roleRepository, IHttpContextService httpContextService)
        {
            _roleRepository = roleRepository;
            _httpContextService = httpContextService;
        }

        public async Task<bool> AreVisibleRolesToCurrentUserAsync(IEnumerable<int> roleIds)
        {
            foreach (var roleId in roleIds)
            {
                if (!await IsVisibleRoleToCurrentUser(roleId))
                    return false;
            }
            return true;
        }

        private async Task<bool> IsVisibleRoleToCurrentUser(int roleId)
        {
            var role = await _roleRepository.GetByIdAsync(roleId);
            if (!ApplicationAdminRoleNameUtils.IsSuperAdminOrOwnerAdmin(role.Name))
                return role.IsActive;

            if (ApplicationAdminRoleNameUtils.IsSuperAdmin(role.Name))
                return _httpContextService.IsSuperAdmin;

            return _httpContextService.IsSuperAdmin || (_httpContextService.IsOwnerAdmin && role.IsActive);
        }
    }
}
