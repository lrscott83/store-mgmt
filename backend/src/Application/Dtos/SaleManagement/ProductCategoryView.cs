namespace Application.Dtos.SaleManagement
{
    public sealed class ProductCategoryView
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }
        public int ProductsCount { get; set; }
    }
}
