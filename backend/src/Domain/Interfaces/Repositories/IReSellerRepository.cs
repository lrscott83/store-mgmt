using Domain.Common.Enums;
using Domain.Common.Repositories;
using Domain.Entities.ReSellers;

namespace Domain.Interfaces.Repositories
{
    public interface IReSellerRepository : IGenericRepository<ReSeller, Guid>
    {
        public Task<IEnumerable<ReSeller>> GetAllReSellersIncludingUserAsync(bool includeInactive);
        Task<ReSeller> GetByUserIdIgnoreQueryFiltersAsync(Guid userId);
        Task<ReSeller> GetByUserNameAsync(string code);
        public Task<ReSeller> GetReSellerIncludingUserByIdAsync(Guid reSellerId);
        Task<bool> HasReSellerAnyFeatureAsync(Guid userId, List<StoreRoleFeatures> storeRoleFeatures);
    }
}
