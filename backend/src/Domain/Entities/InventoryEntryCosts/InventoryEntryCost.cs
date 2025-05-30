using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.InventoryEntries;
using Domain.Entities.OrderItems;

namespace Domain.Entities.InventoryEntryCosts
{
    public sealed class InventoryEntryCost : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid InventoryEntryId { get; set; }
        public InventoryEntry InventoryEntry { get; set; } = null!;
        public decimal CostPrice { get; set; }
        public int Quantity { get; set; }
        public Guid OrderItemId { get; set; }
        public OrderItem OrderItem { get; set; } = null!;
        public Guid TenantId { get; set; }

        private InventoryEntryCost(
            Guid id,
            Guid inventoryEntryId,
            decimal costPrice,
            int quantity,
            Guid orderItemId,
            Guid tenantId
        ) : base(id)
        {
            InventoryEntryId = inventoryEntryId;
            CostPrice = costPrice;
            Quantity = quantity;
            OrderItemId = orderItemId;
            TenantId = tenantId;
        }

        private static InventoryEntryCost Create(
            Guid id,
            Guid inventoryEntryId,
            decimal costPrice,
            int quantity,
            Guid orderItemId,
            Guid tenantId
        )
        {
            var cost = new InventoryEntryCost(id, inventoryEntryId, costPrice, quantity, orderItemId, tenantId);
            cost.Raise(new InventoryEntryCostCreatedDomainEvent(cost.Id, inventoryEntryId));
            return cost;
        }

        public static InventoryEntryCost Create(
            Guid inventoryEntryId,
            decimal costPrice,
            int quantity,
            Guid orderItemId,
            Guid tenantId
        )
        {
            return Create(Guid.NewGuid(), inventoryEntryId, costPrice, quantity, orderItemId, tenantId);
        }
    }

    public sealed record InventoryEntryCostCreatedDomainEvent(Guid InventoryEntryCostId, Guid InventoryEntryId) : IDomainEvent;
}
