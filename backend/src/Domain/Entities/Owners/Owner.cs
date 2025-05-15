using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.Stores;
using Domain.Entities.Users;

namespace Domain.Entities.Owners
{
    public sealed class Owner : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public string Description { get; set; }
        public bool Guest { get; set; } = true;
        public ICollection<Store> Stores { get; set; }
        public Guid TenantId { get; private set; }
        public ReSellerOwner ReSellerOwner { get; set; }

        private Owner(Guid id, Guid userId, bool guest, Guid tenantId, string description)
            : base(id)
        {
            UserId = userId;
            Guest = guest;
            Description = description;
            TenantId = tenantId;
            Stores = new List<Store>();
        }

        public static Owner Create(Guid id, Guid userId, bool guest, Guid tenantId, string description)
        {
            var store = new Owner(id, userId, guest, tenantId, description);
            store.Raise(new OwnerCreatedDomainEvent(store.Id, userId));
            return store;
        }
        public static Owner Create(Guid userId, bool guest, Guid tenantId, string description)
        {
            return Create(Guid.NewGuid(), userId, guest, tenantId, description);
        }
    }

    public sealed record OwnerCreatedDomainEvent(Guid ownerId, Guid userId) : IDomainEvent;
}
