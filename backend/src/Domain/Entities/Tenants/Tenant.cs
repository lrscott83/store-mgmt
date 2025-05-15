using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Features;
using Domain.Entities.Stores;
using Domain.Entities.StoreModules;
using Domain.Entities.Users;
using Domain.Entities.Owners;

namespace Domain.Entities.Tenants
{
    public sealed class Tenant : AuditableEntity<Guid>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string? ConnectionString { get; set; }

        private Tenant(Guid id, string name, string description, string? connectionString = null)
            : base(id)
        {
            Name = name;
            Description = description;
            ConnectionString = connectionString;
        }

        public static Tenant Create(string name, string description, string? connectionString = null)
        {
            return Create(Guid.NewGuid(), name, description, connectionString);
        }

        public static Tenant Create(Guid id, string name, string description, string? connectionString = null)
        {
            var tenant = new Tenant(id, name, description, connectionString);
            tenant.Raise(new UserCreatedDomainEvent(tenant.Id));
            return tenant;
        }
    }

    public sealed record TenantCreatedDomainEvent(Guid tenantId) : IDomainEvent;
}
