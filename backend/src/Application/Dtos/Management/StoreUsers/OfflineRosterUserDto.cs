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
    public OfflineVerifierDto? Verifier { get; set; }
    public string WrappedDek { get; set; } = string.Empty;
    public string WrapSalt { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
    public DateOnly? PaymentDueDate { get; set; }
    public bool IsInTrial { get; set; }
    public string PaymentStatus { get; set; } = string.Empty;
    public int WrapIterations { get; set; }
    /// <summary>
    /// A signed JWT valid until the roster bundle's own <c>ExpiresAt</c>,
    /// minted at export time so an offline session can authenticate against
    /// the API (e.g. the daily store-usage telemetry POST) without an online
    /// login. Empty for legacy bundles that predate this field.
    /// </summary>
    public string OfflineAuthToken { get; set; } = string.Empty;
}
