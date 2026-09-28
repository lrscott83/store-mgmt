namespace Application.Dtos.SaleManagement
{
    public sealed class ProductCategoryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }
        /// <summary>Slug público de la categoría en el catálogo web (null = aún no publicado).</summary>
        public string? Slug { get; set; }
    }
}
