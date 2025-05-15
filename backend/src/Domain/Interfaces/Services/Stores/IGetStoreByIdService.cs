using Domain.Entities.Stores;

namespace Domain.Interfaces.Services.Stores
{
    public interface IGetStoreByIdService
    {
        Task<Store> GetStoreByIdIncludingModulesAsync(Guid id);
    }
}
