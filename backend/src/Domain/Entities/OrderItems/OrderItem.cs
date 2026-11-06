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

        // --- Snapshot mayorista de la línea ---------------------------------------------------
        //
        // Una venta mayorista se cobra POR PAQUETES (packs) y el precio aplicado es el de la
        // UNIDAD dentro del paquete, pero el resumen que la tienda lee por WhatsApp habla en
        // paquetes ("12 cajas"). Con solo `Quantity` (unidades) y `Price` (por unidad) ese mensaje
        // no se puede reconstruir: los paquetes son el resultado de dividir por la config del
        // momento, y la config puede cambiar después. Por eso el hecho se congela aquí, igual que
        // el snapshot de precio que ya existía.
        //
        // Todo queda en sus defaults (0/null) en los pedidos que NO son mayoristas, así que una
        // venta al detal se lee exactamente como antes.

        /// <summary>Unidades por paquete aplicadas al cobrar la línea. 0 = la línea no fue mayorista.</summary>
        public int WholesalePackSize { get; set; }

        /// <summary>Paquetes cobrados en la línea. 0 = la línea no fue mayorista.</summary>
        public int WholesalePacks { get; set; }

        /// <summary>Mínimo de paquetes del escalón que fijó el precio. null = sin snapshot mayorista.</summary>
        public int? WholesaleTierMinPacks { get; set; }

        /// <summary>Precio por UNIDAD del escalón aplicado (igual a <see cref="Price"/>). null = sin snapshot.</summary>
        public decimal? WholesaleTierUnitPrice { get; set; }

        /// <summary>Unidad de medida que usa el dueño ("caja", "fardo"). null = la de por defecto.</summary>
        public string? WholesaleUnitLabel { get; set; }

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
            int? discountPrice,
            int wholesalePackSize,
            int wholesalePacks,
            int? wholesaleTierMinPacks,
            decimal? wholesaleTierUnitPrice,
            string? wholesaleUnitLabel
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
            WholesalePackSize = wholesalePackSize;
            WholesalePacks = wholesalePacks;
            WholesaleTierMinPacks = wholesaleTierMinPacks;
            WholesaleTierUnitPrice = wholesaleTierUnitPrice;
            WholesaleUnitLabel = wholesaleUnitLabel;
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
            int? discountPrice = null,
            int wholesalePackSize = 0,
            int wholesalePacks = 0,
            int? wholesaleTierMinPacks = null,
            decimal? wholesaleTierUnitPrice = null,
            string? wholesaleUnitLabel = null
        )
        {
            var orderItem = new OrderItem(
                id, orderId, productId, name, quantity, price, orderIndex, tenantId,
                basePrice, percentDiscountPrice, discountPrice,
                wholesalePackSize, wholesalePacks, wholesaleTierMinPacks,
                wholesaleTierUnitPrice, wholesaleUnitLabel);
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
            int? discountPrice = null,
            int wholesalePackSize = 0,
            int wholesalePacks = 0,
            int? wholesaleTierMinPacks = null,
            decimal? wholesaleTierUnitPrice = null,
            string? wholesaleUnitLabel = null
        )
        {
            return Create(
                Guid.NewGuid(), productId, name, quantity, price, orderIndex, orderId, tenantId,
                basePrice, percentDiscountPrice, discountPrice,
                wholesalePackSize, wholesalePacks, wholesaleTierMinPacks,
                wholesaleTierUnitPrice, wholesaleUnitLabel);
        }
    }

    public sealed record OrderItemCreatedDomainEvent(Guid OrderItemId, Guid OrderId) : IDomainEvent;


}
