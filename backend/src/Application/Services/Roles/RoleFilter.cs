using Application.Abstractions.HttpContext;
using Application.Abstractions.Roles;
using Domain.Common.Utils;
using Domain.Entities.Roles;

namespace Application.Services.Roles
{
    public class RoleFilter : IRoleFilter
    {
        private readonly IHttpContextService _httpContextService;

        public RoleFilter(IHttpContextService httpContextService)
        {
            _httpContextService = httpContextService;
        }

        public IEnumerable<Role> FilterVisibleRolesByCurrentUser(IEnumerable<Role> roles)
        {
            if (_httpContextService.IsSuperAdmin)
                return roles;

            return _httpContextService.IsOwnerAdmin
                ? roles.Where(r => !ApplicationAdminRoleNameUtils.IsSuperAdmin(r.Name)).ToList()
                : roles.Where(r => !ApplicationAdminRoleNameUtils.IsSuperAdminOrOwnerAdmin(r.Name)).ToList();
        }
    }
}
