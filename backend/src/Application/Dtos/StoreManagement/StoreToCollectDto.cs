namespace Application.Dtos.StoreManagement
{
    public sealed class StoreToCollectDto
    {
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public string OwnerName { get; set; } = string.Empty;
        public float Amount { get; set; }
        public DateOnly? NextDueDate { get; set; }
        public string Status { get; set; } = string.Empty;
    }
}