using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Common.Events;
using Domain.Entities.OrderItems;
using Domain.Entities.Stores;

namespace Domain.Entities.Orders
{
    public sealed class Order : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public ICollection<OrderItem> OrderItems { get; set; }
        public OrderType OrderType { get; set; }
        public string Description { get; set; }
        public decimal Total { get; set; }
        public int ItemsCount { get; set; }
        public DateTime Date { get; set; }
        public Guid TenantId { get; set; }
        private Order(Guid id, Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
            : base(id)
        {
            StoreId = storeId;
            OrderType = orderType;
            Description = description;
            Total = total;
            ItemsCount = itemsCount;
            Date = date;
            TenantId = tenantId;
            OrderItems = new List<OrderItem>();
        }

        private static Order Create(Guid id, Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
        {
            var order = new Order(id, storeId, orderType, description, total, itemsCount, date, tenantId);
            order.Raise(new OrderCreatedDomainEvent(order.Id, storeId));
            return order;
        }

        public static Order Create(Guid storeId, OrderType orderType, string description, decimal total, int itemsCount, DateTime date, Guid tenantId)
        {
            return Create(Guid.NewGuid(), storeId, orderType, description, total, itemsCount, date, tenantId);
        }
    }

    public sealed record OrderCreatedDomainEvent(Guid OrderId, Guid StoreId) : IDomainEvent;

}
