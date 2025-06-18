namespace Application.Dtos.SaleManagement
{
    public sealed class ProductDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; }    
        public Guid CategoryId { get; set; }
        public string CategoryName { get; set; } = null!;
        public decimal Price { get; set; }
        public int Order { get; set; }
        public bool AvailableToSale { get; set; } = true;
        public bool DiscountFromInventory { get; set; } = true;
        public string BusinessId { get; set; } = null!;
        public bool IsActive { get; set; }
    }
}
