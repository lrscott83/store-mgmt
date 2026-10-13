namespace Application.Dtos.StoreManagement
{
    /// <summary>
    /// Slug público (`/catalog/&lt;slug&gt;`) del catálogo web de UNA tienda, tal como quedó guardado.
    ///
    /// Es la respuesta de `PUT /v1/stores/{storeId}/catalog-slug`: SOLO el slug, porque el endpoint
    /// solo escribe esa columna de `Store`. La lectura combinada (plantilla + slug) del editor del
    /// SuperAdmin es <see cref="StoreCatalogTemplateDto"/>.
    /// </summary>
    public sealed class StoreCatalogSlugDto
    {
        public Guid StoreId { get; set; }

        /// <summary>Slug YA normalizado y persistido. Nunca vacío en una respuesta de escritura.</summary>
        public string CatalogSlug { get; set; } = string.Empty;
    }
}
