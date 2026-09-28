using Domain.Common.Catalog;
using Domain.Common.Entities;
using Domain.Common.Enums;
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
        /// <summary>Moneda de Price y de los precios mayoristas (plan 2026-09-16). Default CUP.</summary>
        public Currency Currency { get; set; } = Currency.CUP;
        public int Order { get; set; }
        public bool AvailableToSale { get; set; } = true;
        public bool DiscountFromInventory { get; set; } = true;
        public string BusinessId { get; set; } = null!;
        public Guid TenantId { get; set; }

        // --- Campos del catálogo web (módulo WebCatalog, plan 2026-09-27; se editan solo en la
        // vista "Catálogo Web", decisión D8). Sin HTML: la descripción es texto plano (D9). ---

        /// <summary>Descripción del catálogo. Texto plano, nunca HTML.</summary>
        public string Description { get; set; } = string.Empty;
        /// <summary>% de descuento escalado (CatalogScales.PERCENT_SCALE): 1250 == 12.50 %.</summary>
        public int PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado (CatalogScales.DISCOUNT_PRICE_SCALE): 500 == 5.00.</summary>
        public int DiscountPrice { get; set; }
        /// <summary>Marca "Nuevo" del catálogo.</summary>
        public bool IsNew { get; set; }
        /// <summary>Clave de la imagen principal del catálogo (null = sin imagen).</summary>
        public string? Image { get; set; }
        /// <summary>Galería del catálogo (el images[] del contrato HTTP), ordenada por Order.</summary>
        public ICollection<ProductImage> Images { get; set; }

        public ICollection<InventoryEntry> InventoryEntries { get; set; }
        public ICollection<OrderItem> OrderItems { get; set; }

        /// <summary>Precio final combinando % y monto rebajado (ver CatalogPricing).</summary>
        public decimal FinalPrice => CatalogPricing.FinalPrice(Price, PercentDiscountPrice, DiscountPrice);

        /// <summary>true si el producto tiene algún descuento de catálogo.</summary>
        public bool HasDiscount => CatalogPricing.HasDiscount(PercentDiscountPrice, DiscountPrice);

        private Product(
            Guid id,
            string name,
            Guid categoryId,
            decimal price,
            int order,
            bool availableToSale,
            bool discountFromInventory,
            string businessId,
            Guid tenantId,
            string description = "",
            int percentDiscountPrice = 0,
            int discountPrice = 0,
            bool isNew = false,
            string? image = null
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
            Description = description ?? string.Empty;
            PercentDiscountPrice = percentDiscountPrice;
            DiscountPrice = discountPrice;
            IsNew = isNew;
            Image = image;
            InventoryEntries = new List<InventoryEntry>();
            OrderItems = new List<OrderItem>();
            Images = new List<ProductImage>();
        }

        /// <summary>
        /// Crea el producto con un id CONOCIDO. Lo usa el espejo del catálogo web (módulo 18): el
        /// POS es offline-first y ya generó ese id en el dispositivo, así que el servidor lo
        /// respeta para que la copia publicada siga siendo 1:1 con el origen.
        /// </summary>
        public static Product Create(
            Guid id,
            string name,
            Guid categoryId,
            decimal price,
            int order,
            bool availableToSale,
            bool discountFromInventory,
            string businessId,
            Guid tenantId,
            string description = "",
            int percentDiscountPrice = 0,
            int discountPrice = 0,
            bool isNew = false,
            string? image = null
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
                tenantId,
                description,
                percentDiscountPrice,
                discountPrice,
                isNew,
                image
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
            Guid tenantId,
            string description = "",
            int percentDiscountPrice = 0,
            int discountPrice = 0,
            bool isNew = false,
            string? image = null
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
                tenantId,
                description,
                percentDiscountPrice,
                discountPrice,
                isNew,
                image
            );
        }
    }
    public sealed record ProductCreatedDomainEvent(Guid ProductId, Guid CategoryId) : IDomainEvent;

}
