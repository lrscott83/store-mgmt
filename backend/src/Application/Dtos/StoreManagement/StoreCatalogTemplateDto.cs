using Domain.Entities.StoreCatalogSettings;

namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// PLANTILLA (vista) del catálogo público de UNA tienda, para el editor del SuperAdmin
    /// (`/admin/stores`, mismo patrón por-tienda que `{storeId}/module-pricing`).
    ///
    /// Es lo único que este endpoint lee y escribe: el id de la plantilla con la que el storefront
    /// pinta la tienda. Nunca vacío: sin fila, o con la columna en blanco, se devuelve
    /// <see cref="StoreCatalogSettings.DefaultTemplateId"/>.
    /// </summary>
    public sealed class StoreCatalogTemplateDto
    {
        public Guid StoreId { get; set; }

        public string TemplateId { get; set; } = StoreCatalogSettings.DefaultTemplateId;
    }
}
