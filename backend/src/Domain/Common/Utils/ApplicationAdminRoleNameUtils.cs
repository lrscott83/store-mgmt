using Domain.Common.Enums;
using Domain.Common.Extensions;

namespace Domain.Common.Utils
{
    public static class ApplicationAdminRoleNameUtils
    {
        public static bool IsSuperAdmin(string roleName) => RoleType.SuperAdmin.GetDisplayName() == roleName;
        public static bool IsOwnerAdmin(string roleName) => RoleType.OwnerAdmin.GetDisplayName() == roleName;
        public static bool IsSuperAdminOrOwnerAdmin(string roleName) => IsSuperAdmin(roleName) || IsOwnerAdmin(roleName);
    }
}
