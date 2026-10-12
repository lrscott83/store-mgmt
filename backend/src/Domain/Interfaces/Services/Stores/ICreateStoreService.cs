using Domain.Entities.Stores;

namespace Domain.Interfaces.Services.Stores
{
    public interface ICreateStoreService
    {
        /// <summary>
        /// store-birth-superior (2026-10-11): the module set is NOT a caller decision. The store is
        /// born on plan Superior (3) and receives exactly the Superior plan catalog filtered by
        /// <c>Module.IsActive</c> AND <c>Module.AvailableToStore</c> — which excludes by
        /// construction the VIP-only modules (16, Múltiples pagos) and anything retired.
        /// </summary>
        Task<Store> CreateStoreAsync(Guid ownerId, Guid tenantId, string name, string? address, string? description, bool approved);
    }
}