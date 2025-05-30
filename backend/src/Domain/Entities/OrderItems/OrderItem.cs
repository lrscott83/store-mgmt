using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.InventoryEntryCosts;
using Domain.Entities.Orders;
using Domain.Entities.Products;

namespace Domain.Entities.OrderItems
{
    public sealed class OrderItem : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public Guid OrderId { get; set; }
        public Order Order { get; set; } = null!;
        public string Name { get; set; }
        public int Quantity { get; set; }
        public decimal Price { get; set; }
        public int OrderIndex { get; set; }
        public ICollection<InventoryEntryCost> InventoryProductCosts { get; set; }

        public Guid TenantId { get; set; }

        private OrderItem(
            Guid id,
            Guid orderId,
            Guid productId,
            string name,
            int quantity,
            decimal price,
            int orderIndex,
            Guid tenantId
        ) : base(id)
        {
            ProductId = productId;
            Name = name;
            Quantity = quantity;
            Price = price;
            OrderIndex = orderIndex;
            OrderId = orderId;
            TenantId = tenantId;
            InventoryProductCosts = new List<InventoryEntryCost>();
        }

        public static OrderItem Create(
            Guid id,
            Guid productId,
            string name,
            int quantity,
            decimal price,
            int orderIndex,
            Guid orderId,
            Guid tenantId
        )
        {
            var orderItem = new OrderItem(id, orderId, productId, name, quantity, price, orderIndex, tenantId);
            orderItem.Raise(new OrderItemCreatedDomainEvent(orderItem.Id, orderId));
            return orderItem;
        }

        public static OrderItem Create(
            Guid orderId,
            Guid productId,
            string name,
            int quantity,
            decimal price,
            int orderIndex,
            Guid tenantId
        )
        {
            return Create(Guid.NewGuid(), productId, name, quantity, price, orderIndex, orderId, tenantId);
        }
    }

    public sealed record OrderItemCreatedDomainEvent(Guid OrderItemId, Guid OrderId) : IDomainEvent;


}
