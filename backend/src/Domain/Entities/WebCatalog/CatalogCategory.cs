using Domain.Common.Entities;

namespace Domain.Entities.WebCatalog
{
    /// <summary>
    /// Copia publicada de una categoría de productos en el catálogo web (plan 2026-09-27).
    /// Guardo la relación 1:1 con el origen por <see cref="SourceCategoryId"/>: la sincronización
    /// busca por ese id, así que re-sincronizar actualiza y nunca duplica.
    /// </summary>
    public sealed class CatalogCategory : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid TenantId { get; set; }
        public Guid StoreId { get; set; }
        /// <summary>Id de la ProductCategory de origen (relación 1:1).</summary>
        public Guid SourceCategoryId { get; set; }
        public string Name { get; set; }
        /// <summary>Slug público dentro de la tienda (único por tienda y estable en las URLs).</summary>
        public string Slug { get; set; }
        public int Order { get; set; }
        /// <summary>Momento de la última sincronización de esta fila.</summary>
        public DateTime SyncedAt { get; set; }
        public ICollection<CatalogProduct> Products { get; set; }

        private CatalogCategory(Guid id, Guid storeId, Guid sourceCategoryId, string name, string slug, int order,
            Guid tenantId) : base(id)
        {
            StoreId = storeId;
            SourceCategoryId = sourceCategoryId;
            Name = name;
            Slug = slug;
            Order = order;
            TenantId = tenantId;
            Products = new List<CatalogProduct>();
        }

        public static CatalogCategory Create(Guid storeId, Guid sourceCategoryId, string name, string slug, int order,
            Guid tenantId)
            => new(Guid.NewGuid(), storeId, sourceCategoryId, name, slug, order, tenantId);
    }
}
