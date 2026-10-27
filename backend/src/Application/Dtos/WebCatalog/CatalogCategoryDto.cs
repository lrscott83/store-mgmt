namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Categoría tal como la consume la vista SuperAdmin del catálogo: listado de paneles y
    /// respuesta del alta. Solo los campos que esa vista usa; el resto de la entidad no viaja.
    /// </summary>
    public sealed class CatalogCategoryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public int Order { get; set; }
    }
}
