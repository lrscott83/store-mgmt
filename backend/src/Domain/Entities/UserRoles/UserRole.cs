using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Roles;
using Domain.Entities.Users;

namespace Domain.Entities.UserRoles
{
    public class UserRole : AuditableEntity, ITenantBaseEntity
    {
        public Guid UserId { get; set; }
        public int RoleId { get; set; }
        public User User { get; set; } = null!;
        public Role Role { get; set; } = null!;
        public Guid TenantId { get; private set; }

        private UserRole(Guid userId, int roleId, Guid tenantId) 
        {
            UserId = userId;
            RoleId = roleId;
            TenantId = tenantId;
        }

        public static UserRole Create(Guid userId, int roleId, Guid tenantId)
        {
            var userRole = new UserRole(userId, roleId, tenantId);
            userRole.Raise(new UserRoleCreatedDomainEvent(userRole.UserId, userRole.RoleId));
            return userRole;
        }
    }

    public sealed record UserRoleCreatedDomainEvent(Guid userId, int roleId) : IDomainEvent;
}
