namespace Application.Dtos.Management.StoreUsers;

public sealed class OfflineRosterDto
{
    public string BundleId { get; set; } = string.Empty;
    public long IssuedAt { get; set; }
    public long ExpiresAt { get; set; }
    public int FormatVersion { get; set; }
    public Guid StoreId { get; set; }
    public List<OfflineRosterUserDto> Users { get; set; } = new();
}
