namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Resumen de una sincronización del catálogo web (plan 2026-09-27). Lo que se creó, lo que se
    /// actualizó y lo que se despublicó porque en el origen dejó de estar en venta (decisión D6).
    /// </summary>
    public sealed class CatalogSyncSummaryDto
    {
        /// <summary>Slug público de la tienda en /catalog/&lt;slug&gt;.</summary>
        public string StoreSlug { get; set; } = string.Empty;
        /// <summary>Ruta pública del catálogo dentro de la app.</summary>
        public string CatalogUrl { get; set; } = string.Empty;
        public DateTime SyncedAt { get; set; }
        public int CategoriesCreated { get; set; }
        public int CategoriesUpdated { get; set; }
        public int ProductsCreated { get; set; }
        public int ProductsUpdated { get; set; }
        /// <summary>Productos que quedaron despublicados (no en venta, inactivos o borrados en el origen).</summary>
        public int ProductsDeactivated { get; set; }
    }
}
