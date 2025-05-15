using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Owners;
using Domain.Entities.ReSellers;

namespace Domain.Entities.ReSellerOwners
{
    public sealed class ReSellerOwner : AuditableEntity, ITenantBaseEntity
    {
        public Guid ReSellerId { get; set; }
        public ReSeller ReSeller { get; set; } = null!;
        public Guid OwnerId { get; set; }
        public Owner Owner { get; set; } = null!;
        public float DiscountPrice { get; set; } = 0;
        public float PercentDiscountPrice { get; set; } = 0;
        public Guid TenantId { get; private set; }

        private ReSellerOwner(Guid reSellerId, Guid ownerId, float discountPrice, float percentDiscountPrice, Guid tenantId)
        {
            ReSellerId = reSellerId;
            OwnerId = ownerId;
            DiscountPrice = discountPrice;
            PercentDiscountPrice = percentDiscountPrice;
            TenantId = tenantId;
        }

        public static ReSellerOwner Create(Guid reSellerId, Guid ownerId, float discountPrice, float percentDiscountPrice, Guid tenantId)
        {
            var store = new ReSellerOwner(reSellerId, ownerId, discountPrice, percentDiscountPrice, tenantId);
            store.Raise(new ReSellerCreatedDomainEvent(reSellerId, ownerId));
            return store;
        }
    }

    public sealed record ReSellerOwnerCreatedDomainEvent(Guid ReSellerId, Guid OwnerId) : IDomainEvent;
}
