using Domain.Common.Catalog;
using Domain.Common.Entities;
using Domain.Common.Enums;

namespace Domain.Entities.WebCatalog
{
    /// <summary>
    /// Copia publicada de un producto en el catálogo web (plan 2026-09-27). Es un espejo de los
    /// campos que el Owner edita en la vista Catálogo Web; el origen sigue siendo Product.
    /// </summary>
    public sealed class CatalogProduct : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid TenantId { get; set; }
        public Guid StoreId { get; set; }
        /// <summary>Id del Product de origen (relación 1:1).</summary>
        public Guid SourceProductId { get; set; }
        public Guid CatalogCategoryId { get; set; }
        public CatalogCategory CatalogCategory { get; set; } = null!;
        public string Name { get; set; }
        /// <summary>Descripción publicada. Texto plano, nunca HTML.</summary>
        public string Description { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public Currency Currency { get; set; } = Currency.CUP;
        /// <summary>% de descuento escalado (PERCENT_SCALE): 1250 == 12.50 %.</summary>
        public int PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado (DISCOUNT_PRICE_SCALE): 500 == 5.00.</summary>
        public int DiscountPrice { get; set; }
        public bool IsNew { get; set; }
        public string? Image { get; set; }
        public int Order { get; set; }
        /// <summary>Momento de la última sincronización de esta fila.</summary>
        public DateTime SyncedAt { get; set; }
        public ICollection<CatalogProductImage> Images { get; set; }

        /// <summary>Precio final combinando % y monto rebajado (ver CatalogPricing).</summary>
        public decimal FinalPrice => CatalogPricing.FinalPrice(Price, PercentDiscountPrice, DiscountPrice);

        /// <summary>true si el producto publicado tiene algún descuento.</summary>
        public bool HasDiscount => CatalogPricing.HasDiscount(PercentDiscountPrice, DiscountPrice);

        private CatalogProduct(Guid id, Guid storeId, Guid sourceProductId, Guid catalogCategoryId, string name,
            Guid tenantId) : base(id)
        {
            StoreId = storeId;
            SourceProductId = sourceProductId;
            CatalogCategoryId = catalogCategoryId;
            Name = name;
            TenantId = tenantId;
            Images = new List<CatalogProductImage>();
        }

        public static CatalogProduct Create(Guid storeId, Guid sourceProductId, Guid catalogCategoryId, string name,
            Guid tenantId)
            => new(Guid.NewGuid(), storeId, sourceProductId, catalogCategoryId, name, tenantId);
    }
}
