using Domain.Common.Entities;
using Domain.Common.Enums;
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
        /// <summary>Moneda de Price (plan 2026-09-16). Default CUP.</summary>
        public Currency Currency { get; set; } = Currency.CUP;
        /// <summary>
        /// Precio base del producto en el momento del pedido (sin descuentos), para poder
        /// recalcular el precio final desde el snapshot. null en pedidos anteriores al snapshot.
        /// </summary>
        public decimal? BasePrice { get; set; }
        /// <summary>
        /// % de descuento escalado del producto en el momento del pedido
        /// (CatalogScales.PERCENT_SCALE: 1250 == 12.50 %). null en pedidos anteriores.
        /// </summary>
        public int? PercentDiscountPrice { get; set; }
        /// <summary>
        /// Descuento fijo escalado del producto en el momento del pedido
        /// (CatalogScales.DISCOUNT_PRICE_SCALE: 500 == 5.00). null en pedidos anteriores.
        /// </summary>
        public int? DiscountPrice { get; set; }
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
            Guid tenantId,
            decimal? basePrice,
            int? percentDiscountPrice,
            int? discountPrice
        ) : base(id)
        {
            ProductId = productId;
            Name = name;
            Quantity = quantity;
            Price = price;
            OrderIndex = orderIndex;
            OrderId = orderId;
            TenantId = tenantId;
            BasePrice = basePrice;
            PercentDiscountPrice = percentDiscountPrice;
            DiscountPrice = discountPrice;
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
            Guid tenantId,
            decimal? basePrice = null,
            int? percentDiscountPrice = null,
            int? discountPrice = null
        )
        {
            var orderItem = new OrderItem(
                id, orderId, productId, name, quantity, price, orderIndex, tenantId,
                basePrice, percentDiscountPrice, discountPrice);
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
            Guid tenantId,
            decimal? basePrice = null,
            int? percentDiscountPrice = null,
            int? discountPrice = null
        )
        {
            return Create(
                Guid.NewGuid(), productId, name, quantity, price, orderIndex, orderId, tenantId,
                basePrice, percentDiscountPrice, discountPrice);
        }
    }

    public sealed record OrderItemCreatedDomainEvent(Guid OrderItemId, Guid OrderId) : IDomainEvent;


}
