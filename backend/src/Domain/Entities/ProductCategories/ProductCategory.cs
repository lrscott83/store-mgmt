using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Products;
using Domain.Entities.Stores;

namespace Domain.Entities.ProductCategories
{
    public sealed class ProductCategory : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public string Name { get; set; }
        public int Order { get; set; }
        /// <summary>
        /// Slug público de la categoría dentro de la tienda (plan 2026-09-27, decisión D4).
        /// Único por tienda; null mientras la categoría nunca se haya publicado en el catálogo web.
        /// </summary>
        public string? Slug { get; set; }
        public Guid TenantId { get; set; }
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public ICollection<Product> Products { get; set; }

        private ProductCategory(Guid id, Guid storeId, string name, int order, Guid tenantId, string? slug = null)
            : base(id)
        {
            StoreId = storeId;
            Name = name;
            Order = order;
            TenantId = tenantId;
            Slug = slug;
            Products = new List<Product>();
        }

        /// <summary>
        /// Crea la categoría con un id CONOCIDO. Lo usa el espejo del catálogo web (módulo 18):
        /// el POS es offline-first y ya generó ese id en el dispositivo, así que el servidor lo
        /// respeta para que la copia publicada siga siendo 1:1 con el origen.
        /// </summary>
        public static ProductCategory Create(Guid id, Guid storeId, string name, int order, Guid tenantId, string? slug = null)
        {
            var category = new ProductCategory(id, storeId, name, order, tenantId, slug);
            category.Raise(new ProductCategoryCreatedDomainEvent(category.Id, storeId));
            return category;
        }

        public static ProductCategory Create(Guid storeId, string name, int order, Guid tenantId, string? slug = null)
        {
            return Create(Guid.NewGuid(), storeId, name, order, tenantId, slug);
        }
    }

    public sealed record ProductCategoryCreatedDomainEvent(Guid ProductCategoryId, Guid StoreId) : IDomainEvent;
}
