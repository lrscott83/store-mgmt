using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.StorePayments;

namespace Domain.Entities.Stores
{
    public sealed class Store : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public string Name { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public bool Approved {  get; set; } = false;
        public Guid TenantId { get; set; }
        public Owner Owner { get; set; } = null!;
        public ICollection<StoreUser> StoreUsers { get; set; }
        public ICollection<StoreModule> StoreModules { get; set; }
        public ICollection<StoreRoleFeature> StoreRoleFeatures { get; set; }
        public ICollection<StorePayment> StorePayments { get; set; }
        public Guid OwnerId { get; private set; }
        public DateOnly PaymentStartDate { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);

        private Store(Guid id, Guid ownerId, string name, bool approved, Guid tenantId, DateOnly paymentStartDate,
            string? address = null, string? description = null) 
            : base (id)
        {
            OwnerId = ownerId;
            Name = name; 
            Approved = approved;
            Address = address; 
            Description = description;
            TenantId = tenantId;
            PaymentStartDate = paymentStartDate;
            StoreUsers = new List<StoreUser> ();
            StoreModules = new List<StoreModule>();
            StoreRoleFeatures = new List<StoreRoleFeature> ();
            StorePayments = new List<StorePayment> (); 
        }

        private static Store Create(Guid id, Guid ownerId, string name, bool approved, Guid tenantId, DateOnly paymentStartDate, 
            string? address = null, string? description = null)
        {
            var store = new Store(id, ownerId, name, approved, tenantId, paymentStartDate, address, description);
            store.Raise(new StoreCreatedDomainEvent(store.Id, ownerId));
            return store;
        }
        public static Store Create(string name, Guid ownerId, bool approved, Guid tenantId, DateOnly paymentStartDate, 
            string? address = null, string? description = null)
        {
            return Create(Guid.NewGuid(), ownerId, name, approved, tenantId, paymentStartDate, address, description);
        }
    }

    public sealed record StoreCreatedDomainEvent(Guid StoreId, Guid OwnerId) : IDomainEvent;
}
