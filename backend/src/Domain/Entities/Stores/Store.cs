using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Common.Events;
using Domain.Entities.Owners;
using Domain.Entities.Plans;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.StoreUsers;
using Domain.Entities.StorePayments;
using Domain.Entities.ProductCategories;
using Domain.Entities.InventoryEntries;
using Domain.Entities.Orders;
using Domain.Entities.StoreUsages;

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
        public ICollection<ProductCategory> ProductCategories { get; set; }
        public ICollection<InventoryEntry> InventoryEntries { get; set; }
        public ICollection<Order> Orders { get; set; }
        public ICollection<StoreUsage> StoreUsages { get; set; } = new List<StoreUsage>();

        public Guid OwnerId { get; private set; }
        public DateOnly? PaymentStartDate { get; set; } = null;
        /// <summary>
        /// Owner-plan-change: pins the next payment date (e.g. plan changed to a paid plan while
        /// overdue → pinned to today). Consumed by StoreBillingUtils.GetNextDueDate with top
        /// priority; cleared on payment and on downgrade to Gratis. Nullable — null = no override.
        /// Never a substitute for PaymentStartDate (the billing anchor, which stays untouched).
        /// </summary>
        public DateOnly? NextDueDateOverride { get; set; }
        public int StorePlanId { get; set; }
        public StorePlan StorePlan { get; set; } = null!;

        private Store(Guid id, Guid ownerId, string name, bool approved, Guid tenantId, DateOnly? paymentStartDate = null,
            string? address = null, string? description = null, int storePlanId = (int)StorePlanType.Pago) 
            : base (id)
        {
            OwnerId = ownerId;
            Name = name; 
            Approved = approved;
            Address = address; 
            Description = description;
            TenantId = tenantId;
            PaymentStartDate = paymentStartDate;
            StorePlanId = storePlanId;
            StoreUsers = new List<StoreUser> ();
            StoreModules = new List<StoreModule>();
            StoreRoleFeatures = new List<StoreRoleFeature> ();
            StorePayments = new List<StorePayment> ();
            ProductCategories = new List<ProductCategory> ();
            InventoryEntries = new List<InventoryEntry> ();
            Orders = new List<Order> ();
        }

        private static Store Create(Guid id, Guid ownerId, string name, bool approved, Guid tenantId, DateOnly? paymentStartDate = null, 
            string? address = null, string? description = null, int storePlanId = (int)StorePlanType.Pago)
        {
            var store = new Store(id, ownerId, name, approved, tenantId, paymentStartDate, address, description, storePlanId);
            store.Raise(new StoreCreatedDomainEvent(store.Id, ownerId));
            return store;
        }
        public static Store Create(string name, Guid ownerId, bool approved, Guid tenantId, DateOnly? paymentStartDate = null, 
            string? address = null, string? description = null, int storePlanId = (int)StorePlanType.Pago)
        {
            return Create(Guid.NewGuid(), ownerId, name, approved, tenantId, paymentStartDate, address, description, storePlanId);
        }
    }

    public sealed record StoreCreatedDomainEvent(Guid StoreId, Guid OwnerId) : IDomainEvent;
}
