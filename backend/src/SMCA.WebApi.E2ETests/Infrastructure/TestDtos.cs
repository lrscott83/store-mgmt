namespace SMCA.WebApi.E2ETests.Infrastructure;

// Mirrors Application.Dtos.Authentication.AuthDto (record Login, AuthToken, ExpiresIn,
// RefreshToken, RefreshTokenExpiresAt), deserialized from camelCase JSON.
// The refresh-token fields are additive: System.Text.Json ignores missing members, so
// responses that do not carry them deserialize with null values — zero impact on existing tests.
public sealed class AuthData
{
    public string Login { get; set; } = string.Empty;
    public string AuthToken { get; set; } = string.Empty;
    public DateTime ExpiresIn { get; set; }
    public string? RefreshToken { get; set; }
    public DateTimeOffset? RefreshTokenExpiresAt { get; set; }
}

public sealed class StoreData
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public bool Approved { get; set; }
    public Guid OwnerId { get; set; }
    public string? OwnerName { get; set; }
    public DateOnly? PaymentStartDate { get; set; }
    public DateOnly NextPaymentDate { get; set; }
    public List<ModuleData> Modules { get; set; } = new();
}

public sealed class ModuleData
{
    public int Id { get; set; }
    public string? Name { get; set; }
}

public sealed class MeData
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public List<int> FeatureIds { get; set; } = new();
    public Guid SelectedStoreId { get; set; }
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsActive { get; set; }
}

public sealed class RosterVerifierData
{
    public string Hash { get; set; } = string.Empty;
    public string Salt { get; set; } = string.Empty;
    public int Iterations { get; set; }
}

public sealed class RosterRoleData
{
    public Guid StoreId { get; set; }
    public string StoreName { get; set; } = string.Empty;
    public int ModuleId { get; set; }
    public List<int> FeatureIds { get; set; } = new();
}

public sealed class RosterUserData
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public List<RosterRoleData> Roles { get; set; } = new();
    public List<int> FeatureIds { get; set; } = new();
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public Guid SelectedStoreId { get; set; }
    public RosterVerifierData Verifier { get; set; } = new();
    public string WrappedDek { get; set; } = string.Empty;
    public string WrapSalt { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
    public DateOnly? PaymentDueDate { get; set; }
    public bool IsInTrial { get; set; }
    public string PaymentStatus { get; set; } = string.Empty;
    public int WrapIterations { get; set; }
    public string OfflineAuthToken { get; set; } = string.Empty;
}

public sealed class RosterData
{
    public string BundleId { get; set; } = string.Empty;
    public long IssuedAt { get; set; }
    public long ExpiresAt { get; set; }
    public int FormatVersion { get; set; }
    public Guid StoreId { get; set; }
    public List<RosterUserData> Users { get; set; } = new();
}