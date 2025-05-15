using Domain.Entities.Tenants;

namespace Domain.Interfaces.Services.Tenants
{
    public sealed record UpdateTenantRequestModel(
        Tenant Tenant, string Name, string Description, string? ConnectionString, bool IsActive, IEnumerable<int> FeatureIds);
    public interface IUpdateTenantService
    {
        Task<bool> UpdateTenantAsync(UpdateTenantRequestModel requestModel);
    }
}
