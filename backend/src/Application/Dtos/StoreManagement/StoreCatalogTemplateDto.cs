using Domain.Entities.StoreCatalogSettings;

namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// PLANTILLA (vista) del catálogo público de UNA tienda + su SLUG público, para el editor del
    /// SuperAdmin (`/admin/stores`, mismo patrón por-tienda que `{storeId}/module-pricing`).
    ///
    /// La plantilla es lo que este endpoint lee y escribe; el slug se LEE aquí porque el editor es
    /// el mismo modal (lo escribe `PUT {storeId}/catalog-slug`, que es otro contrato). La plantilla
    /// nunca es vacía: sin fila, o con la columna en blanco, se devuelve
    /// <see cref="StoreCatalogSettings.DefaultTemplateId"/>. El slug SÍ puede venir vacío: una
    /// tienda que nunca sincronizó su catálogo todavía no tiene uno.
    /// </summary>
    public sealed class StoreCatalogTemplateDto
    {
        public Guid StoreId { get; set; }

        public string TemplateId { get; set; } = StoreCatalogSettings.DefaultTemplateId;

        /// <summary>Slug público del catálogo (`/catalog/&lt;slug&gt;`); vacío si aún no se generó.</summary>
        public string CatalogSlug { get; set; } = string.Empty;
    }
}
