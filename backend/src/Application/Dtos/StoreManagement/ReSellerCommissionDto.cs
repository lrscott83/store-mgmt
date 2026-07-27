namespace Application.Dtos.StoreManagement;

public sealed class ReSellerCommissionDto
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int PaymentCount { get; set; }
    public float TotalCommission { get; set; }
}