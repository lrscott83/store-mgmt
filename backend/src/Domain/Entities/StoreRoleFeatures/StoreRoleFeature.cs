using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Features;
using Domain.Entities.Roles;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreRoleFeatures
{
    public sealed class StoreRoleFeature : AuditableEntity, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public int RoleId { get; set; }
        public int FeatureId { get; set; }
        public Store Store { get; set; } = null!;
        public Feature Feature { get; set; } = null!;
        public Role Role { get; set; } = null!;
        public Guid TenantId { get; private set; }

        private StoreRoleFeature(Guid storeId, int roleId, int featureId, Guid tenantId)
        {
            StoreId = storeId;
            RoleId = roleId;
            FeatureId = featureId;
            TenantId = tenantId;
        }

        public static StoreRoleFeature Create(Guid storeId, int roleId, int featureId, Guid tenantId)
        {
            var storeRoleFeature = new StoreRoleFeature(storeId, roleId, featureId, tenantId);
            storeRoleFeature.Raise(new StoreRoleFeatureCreatedDomainEvent(storeId, roleId, featureId));
            return storeRoleFeature;
        }
    }

    public sealed record StoreRoleFeatureCreatedDomainEvent(Guid StoreId, int RoleId, int FeatureId) : IDomainEvent { }
}
