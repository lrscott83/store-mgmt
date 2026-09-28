using Domain.Common.Entities;

namespace Domain.Entities.Products
{
    /// <summary>
    /// Imagen adicional del producto para el catálogo web (plan 2026-09-27).
    /// La imagen principal vive en <see cref="Product.Image"/>; esta tabla representa la
    /// galería (el <c>images[]</c> del contrato HTTP) y su orden de presentación.
    /// </summary>
    public sealed class ProductImage : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;
        /// <summary>Clave relativa del archivo dentro del almacenamiento del catálogo.</summary>
        public string Path { get; set; }
        public int Order { get; set; }
        public Guid TenantId { get; set; }

        private ProductImage(Guid id, Guid productId, string path, int order, Guid tenantId) : base(id)
        {
            ProductId = productId;
            Path = path;
            Order = order;
            TenantId = tenantId;
        }

        public static ProductImage Create(Guid productId, string path, int order, Guid tenantId)
            => Create(Guid.NewGuid(), productId, path, order, tenantId);

        public static ProductImage Create(Guid id, Guid productId, string path, int order, Guid tenantId)
            => new ProductImage(id, productId, path, order, tenantId);
    }
}
