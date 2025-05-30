namespace Application.Dtos.SaleManagement
{
    public sealed class ProductCategoryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }
    }
}
