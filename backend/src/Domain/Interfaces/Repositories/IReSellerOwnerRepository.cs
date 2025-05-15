using Domain.Common.Repositories;
using Domain.Entities.ReSellerOwners;

namespace Domain.Interfaces.Repositories
{
    public interface IReSellerOwnerRepository : IGenericRepository<ReSellerOwner>
    {
        Task<IEnumerable<ReSellerOwner>> GetReSellerOwnersByReSellerIdAsync(Guid reSellerId, bool includeInactive);
        Task<ReSellerOwner> GetByOwnerIdAsync(Guid ownerId);
    }
}
