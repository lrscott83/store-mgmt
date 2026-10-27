namespace Application.Dtos.WebCatalog
{
    /// <summary>
    /// Identidad del producto recién creado (`{ "id": "..." }`), el contrato del alta directa.
    /// El cliente usa ese id para subir la imagen principal con el endpoint de imágenes.
    /// </summary>
    public sealed class CreatedCatalogProductDto
    {
        public Guid Id { get; set; }
    }
}
