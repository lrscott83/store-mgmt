using Domain.Entities.Stores;

namespace Domain.Interfaces.Services.Stores
{
    public interface ICreateStoreService
    {
        Task<Store> CreateStoreAsync(Guid ownerId, Guid tenantId, string name, string? address, string? description, bool approved, List<int> moduleIds);
    }
}
