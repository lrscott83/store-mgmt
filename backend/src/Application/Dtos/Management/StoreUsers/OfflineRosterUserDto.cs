using Application.Dtos.Authentication;

namespace Application.Dtos.Management.StoreUsers;

public sealed class OfflineRosterUserDto
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public ICollection<StoreModuleFeaturesDto> Roles { get; set; } = new List<StoreModuleFeaturesDto>();
    public List<int> FeatureIds { get; set; } = new();
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public Guid SelectedStoreId { get; set; }
    public OfflineVerifierDto Verifier { get; set; } = new();
}
