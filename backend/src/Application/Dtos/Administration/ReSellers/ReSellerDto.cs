namespace Application.Dtos.Administration.ReSellers
{
    public sealed class ReSellerDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public bool Approved { get; set; }
        public bool IsActive { get; set; }
        public string Login {  get; set; }
        public string FullName { get; set; }
        public string CellPhone { get; set; }
        public float DiscountPrice { get; set; } = 0;
        public float PercentDiscountPrice { get; set; } = 0;
        public string? Email { get; set; }
        public string? Description { get; set; }
         
    }
}
