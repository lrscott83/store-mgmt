namespace Application.Dtos.ApplicationManagement.Tenants
{
    public sealed record ModuleFeatureDto(int ModuleId, int FeatureId, string DisplayName, bool IsActive)
    {
    }
}
