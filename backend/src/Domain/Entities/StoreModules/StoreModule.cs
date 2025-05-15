using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Modules;
using Domain.Entities.Stores;

namespace Domain.Entities.StoreModules
{
    public sealed class StoreModule : AuditableEntity, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public int ModuleId { get; set; }
        public Module Module { get; set; } = null!;
        public bool ModulePriceIncluded { get; set; }
        public float Price { get; set; }
        public float ModulePrice { get; set; }
        public float ModuleDiscountPrice { get; set; } = 0;
        public float ModulePercentDiscountPrice { get; set; } = 0;
        public Guid TenantId { get; private set; }
        private StoreModule(Guid storeId, int moduleId, float price, bool modulePriceIncluded,
            float modulePrice, float moduleDiscountPrice, float modulePercentDiscountPrice, Guid tenantId)
        {
            StoreId = storeId;
            ModuleId = moduleId;
            Price = price;
            ModulePriceIncluded = modulePriceIncluded;
            ModulePrice = modulePrice;
            ModuleDiscountPrice = moduleDiscountPrice;
            ModulePercentDiscountPrice = modulePercentDiscountPrice;
            TenantId = tenantId;
        }

        public static StoreModule Create(Guid storeId, int moduleId, float price, bool modulePriceIncluded,
            float modulePrice, float moduleDiscountPrice, float modulePercentDiscountPrice, Guid tenantId)
        {
            var storeModule = new StoreModule(storeId, moduleId, price, modulePriceIncluded,
                modulePrice, moduleDiscountPrice, modulePercentDiscountPrice, tenantId);
            storeModule.Raise(new StoreModuleCreatedEvent(storeId, moduleId));
            return storeModule;
        }
       
    }

    public sealed record StoreModuleCreatedEvent(Guid StoreId, int ModuleId) : IDomainEvent { }
}
