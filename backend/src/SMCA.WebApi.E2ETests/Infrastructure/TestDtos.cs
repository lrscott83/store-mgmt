namespace SMCA.WebApi.E2ETests.Infrastructure;

// Mirrors Application.Dtos.Authentication.AuthDto (record Login, AuthToken, RefreshToken, ExpiresIn),
// deserialized from camelCase JSON.
public sealed class AuthData
{
    public string Login { get; set; } = string.Empty;
    public string AuthToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime ExpiresIn { get; set; }
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
    public DateOnly PaymentStartDate { get; set; }
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