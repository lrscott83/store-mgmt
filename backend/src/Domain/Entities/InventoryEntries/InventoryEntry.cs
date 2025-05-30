using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.InventoryEntryCosts;
using Domain.Entities.Products;
using Domain.Entities.Stores;

namespace Domain.Entities.InventoryEntries
{
    public sealed class InventoryEntry : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public int Quantity { get; set; }
        public int Available { get; set; }
        public decimal CostPrice { get; set; }
        public DateTime Date { get; set; }
        public Guid TenantId { get; set; }
        public ICollection<InventoryEntryCost> InventoryEntryCosts { get; set; }

        private InventoryEntry(
            Guid id,
            Guid storeId,
            Guid productId,
            int quantity,
            int available,
            decimal costPrice,
            DateTime date,
            Guid tenantId
        ) : base(id)
        {
            StoreId = storeId;
            ProductId = productId;
            Quantity = quantity;
            Available = available;
            CostPrice = costPrice;
            Date = date;
            TenantId = tenantId;
            InventoryEntryCosts = new List<InventoryEntryCost>();
        }

        private static InventoryEntry Create(
            Guid id,
            Guid storeId,
            Guid productId,
            int quantity,
            int available,
            decimal costPrice,
            DateTime date,
            Guid tenantId
        )
        {
            var entry = new InventoryEntry(id, storeId, productId, quantity, available, costPrice, date, tenantId);
            entry.Raise(new InventoryEntryCreatedDomainEvent(entry.Id, productId));
            return entry;
        }

        public static InventoryEntry Create(
            Guid storeId,
            Guid productId,
            int quantity,
            int available,
            decimal costPrice,
            DateTime date,
            Guid tenantId
        )
        {
            return Create(Guid.NewGuid(), storeId, productId, quantity, available, costPrice, date, tenantId);
        }
    }

    public sealed record InventoryEntryCreatedDomainEvent(Guid InventoryEntryId, Guid ProductId) : IDomainEvent;

}
