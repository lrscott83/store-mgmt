using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.InventoryEntries;
using Domain.Entities.OrderItems;
using Domain.Entities.ProductCategories;

namespace Domain.Entities.Products
{
    public sealed class Product : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public string Name { get; set; }
        public Guid CategoryId { get; set; }
        public ProductCategory Category { get; set; } = null!;
        public decimal Price { get; set; }
        public int Order { get; set; }
        public bool AvailableToSale { get; set; } = true;
        public bool DiscountFromInventory { get; set; } = true;
        public string BusinessId { get; set; } = null!;
        public Guid TenantId { get; set; }
        public ICollection<InventoryEntry> InventoryEntries { get; set; }
        public ICollection<OrderItem> OrderItems { get; set; }

        private Product(
            Guid id,
            string name,
            Guid categoryId,
            decimal price,
            int order,
            bool availableToSale,
            bool discountFromInventory,
            string businessId,
            Guid tenantId
        ) : base(id)
        {
            Name = name;
            CategoryId = categoryId;
            Price = price;
            Order = order;
            AvailableToSale = availableToSale;
            DiscountFromInventory = discountFromInventory;
            BusinessId = businessId;
            TenantId = tenantId;
            InventoryEntries = new List<InventoryEntry>();
            OrderItems = new List<OrderItem>();
        }

        private static Product Create(
            Guid id,
            string name,
            Guid categoryId,
            decimal price,
            int order,
            bool availableToSale,
            bool discountFromInventory,
            string businessId,
            Guid tenantId
        )
        {
            var product = new Product(
                id,
                name,
                categoryId,
                price,
                order,
                availableToSale,
                discountFromInventory,
                businessId,
                tenantId
            );
            product.Raise(new ProductCreatedDomainEvent(product.Id, categoryId));
            return product;
        }

        public static Product Create(
            string name,
            Guid categoryId,
            decimal price,
            int order,
            bool availableToSale,
            bool discountFromInventory,
            string businessId,
            Guid tenantId
        )
        {
            return Create(
                Guid.NewGuid(),
                name,
                categoryId,
                price,
                order,
                availableToSale,
                discountFromInventory,
                businessId,
                tenantId
            );
        }
    }
    public sealed record ProductCreatedDomainEvent(Guid ProductId, Guid CategoryId) : IDomainEvent;

}
