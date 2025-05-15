using Domain.Common.Results;
using Domain.Entities.Tenants;

namespace Domain.Interfaces.Services.Tenants
{
    public sealed record CreateTenantRequestModel
        (string Name, string Description, string? ConnectionString, IEnumerable<int> FeatureIds) { }

    public interface ICreateTenantService
    {
        Task<bool> CreateTenantAsync(CreateTenantRequestModel requestModel);
    }
}
