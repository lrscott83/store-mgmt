namespace Application.Dtos.Management.StoreUsers;

public sealed class OfflineVerifierDto
{
    public string Hash { get; set; } = string.Empty;
    public string Salt { get; set; } = string.Empty;
    public int Iterations { get; set; }
}
