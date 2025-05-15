using Domain.Common.Repositories;
using Domain.Entities.SystemConfigurations;

namespace Domain.Interfaces.Repositories
{
    public interface ISystemConfigurationRepository : IGenericRepository<SystemConfiguration, int>
    {
        Task<SystemConfiguration> GetSystemConfigurationByIdAsync(int id);
        Task<int> GetTestingPeriodInMonthsAsync();
        Task<float> GetReSellerPercentDiscountPriceAsync();
    }
}
