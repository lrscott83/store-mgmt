using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Common.Events;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.UserRoles;

namespace Domain.Entities.Roles
{
    public sealed class Role : AuditableEntity<int>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public ICollection<UserRole> UserRoles { get; set; }
        public ICollection<StoreRoleFeature> StoreRoleFeatures { get; set; }

        private Role(int id, string name, string description)
            : base(id)
        {
            Name = name;
            Description = description;
        }

        public static Role Create(int id, string name, string description)
        {
            var role = new Role(id, name, description);
            role.Raise(new RoleCreatedDomainEvent(role.Id));
            return role;
        }
    }

    public sealed record RoleCreatedDomainEvent(int RoleId) : IDomainEvent;
}
