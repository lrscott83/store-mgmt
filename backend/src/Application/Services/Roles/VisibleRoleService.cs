using Application.Abstractions.HttpContext;
using Application.Abstractions.Roles;
using Domain.Common.Utils;
using Domain.Entities.Roles;
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
            var roleIdsSet = roleIds.ToHashSet();
            var roles = await _roleRepository.GetRolesByIds(roleIdsSet);
            var rolesById = roles.ToDictionary(r => r.Id);
            foreach (var roleId in roleIdsSet)
            {
                if (!rolesById.TryGetValue(roleId, out var role))
                    return false;

                if (!IsVisibleRoleToCurrentUser(role))
                    return false;
            }
            return true;
        }

        private bool IsVisibleRoleToCurrentUser(Role role)
        {
            if (!ApplicationAdminRoleNameUtils.IsSuperAdminOrOwnerAdmin(role.Name))
                return role.IsActive;

            if (ApplicationAdminRoleNameUtils.IsSuperAdmin(role.Name))
                return _httpContextService.IsSuperAdmin;

            return _httpContextService.IsSuperAdmin || (_httpContextService.IsOwnerAdmin && role.IsActive);
        }
    }
}
