using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Stores;
using Domain.Entities.Users;

namespace Domain.Entities.StoreUsers
{
    public class StoreUser : AuditableEntity, ITenantBaseEntity
    {
        public Guid UserId { get; set; }
        public Guid StoreId { get; set; }
        public User User { get; set; } = null!;
        public Store Store { get; set; } = null!;
        public Guid TenantId { get; private set; }

        private StoreUser(Guid userId, Guid storeId, Guid tenantId)
        {
            UserId = userId;
            StoreId = storeId;
            TenantId = tenantId;
        }

        public static StoreUser Create(Guid userId, Guid storeId, Guid tenantId)
        {
            var storeUser = new StoreUser(userId, storeId, tenantId);
            storeUser.Raise(new StoreUserCreatedDomainEvent(storeUser.UserId, storeUser.StoreId));
            return storeUser;
        }
    }

    public sealed record StoreUserCreatedDomainEvent(Guid userId, Guid storeId) : IDomainEvent;
}
