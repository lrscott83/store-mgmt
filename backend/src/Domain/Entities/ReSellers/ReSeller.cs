using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.Stores;
using Domain.Entities.Users;

namespace Domain.Entities.ReSellers
{
    public sealed class ReSeller : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public bool Approved { get; set; } = false;
        public float DiscountPrice { get; set; } = 0;
        public float PercentDiscountPrice { get; set; } = 0;
        public string Description { get; set; }
        public ICollection<ReSellerOwner> ReSellerOwners { get; set; }
        public Guid TenantId { get; private set; }

        private ReSeller(Guid id, Guid userId, bool approved, float discountPrice, float percentDiscountPrice, Guid tenantId, string description)
            : base(id)
        {
            UserId = userId;
            Approved = approved;
            DiscountPrice = discountPrice;
            PercentDiscountPrice = percentDiscountPrice;
            Description = description;
            TenantId = tenantId;
            ReSellerOwners = new List<ReSellerOwner>();
        }

        public static ReSeller Create(Guid id, Guid userId, bool approved, float discountPrice, float percentDiscountPrice, Guid tenantId, string description)
        {
            var store = new ReSeller(id, userId, approved, discountPrice, percentDiscountPrice, tenantId, description);
            store.Raise(new ReSellerCreatedDomainEvent(store.Id, userId));
            return store;
        }
        public static ReSeller Create(Guid userId, bool approved, float discountPrice, float percentDiscountPrice, Guid tenantId, string description)
        {
            return Create(Guid.NewGuid(), userId, approved, discountPrice, percentDiscountPrice, tenantId, description);
        }
    }

    public sealed record ReSellerCreatedDomainEvent(Guid ReSellerId, Guid UserId) : IDomainEvent;
}
