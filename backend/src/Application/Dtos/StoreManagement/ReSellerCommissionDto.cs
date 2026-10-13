namespace Application.Dtos.StoreManagement;

public sealed class ReSellerCommissionDto
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int PaymentCount { get; set; }

    /// <summary>Total commission in USD: payments whose commission base was the charged amount.</summary>
    public float TotalCommission { get; set; }

    /// <summary>Total commission in CUP: payments whose commission base was the total paid.</summary>
    public float TotalCommissionCup { get; set; }
}