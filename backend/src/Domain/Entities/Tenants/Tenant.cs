using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Users;

namespace Domain.Entities.Tenants
{
    public sealed class Tenant : AuditableEntity<Guid>
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string? ConnectionString { get; set; }

        private Tenant(Guid id, string name, string description, DateTimeOffset createdDate, string? connectionString = null)
            : base(id)
        {
            Name = name;
            Description = description;
            ConnectionString = connectionString;
            CreatedDate = createdDate;
        }

        public static Tenant Create(string name, string description, DateTimeOffset createdDate, string? connectionString = null)
        {
            return Create(Guid.NewGuid(), name, description, createdDate, connectionString);
        }

        public static Tenant Create(Guid id, string name, string description, DateTimeOffset createdDate, string? connectionString = null)
        {
            var tenant = new Tenant(id, name, description, createdDate, connectionString);
            tenant.Raise(new UserCreatedDomainEvent(tenant.Id));
            return tenant;
        }
    }

    public sealed record TenantCreatedDomainEvent(Guid tenantId) : IDomainEvent;
}
