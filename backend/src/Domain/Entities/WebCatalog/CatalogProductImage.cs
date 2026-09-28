using Domain.Common.Entities;

namespace Domain.Entities.WebCatalog
{
    /// <summary>
    /// Imagen publicada de la galería de un producto del catálogo web (plan 2026-09-27).
    /// La clave apunta al mismo archivo que la galería del origen (no se copian binarios al publicar).
    /// </summary>
    public sealed class CatalogProductImage : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid CatalogProductId { get; set; }
        public CatalogProduct CatalogProduct { get; set; } = null!;
        /// <summary>Clave relativa del archivo dentro del almacenamiento del catálogo.</summary>
        public string Path { get; set; }
        public int Order { get; set; }
        public Guid TenantId { get; set; }

        private CatalogProductImage(Guid id, Guid catalogProductId, string path, int order, Guid tenantId) : base(id)
        {
            CatalogProductId = catalogProductId;
            Path = path;
            Order = order;
            TenantId = tenantId;
        }

        public static CatalogProductImage Create(Guid catalogProductId, string path, int order, Guid tenantId)
            => new(Guid.NewGuid(), catalogProductId, path, order, tenantId);
    }
}
