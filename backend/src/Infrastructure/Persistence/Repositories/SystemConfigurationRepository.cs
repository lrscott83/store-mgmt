using Domain.Common.Enums;
using Domain.Entities.SystemConfigurations;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence.Repositories
{
    public class SystemConfigurationRepository : GenericRepository<SystemConfiguration, int>, ISystemConfigurationRepository
    {
        private readonly DbSet<SystemConfiguration> _systemConfigurations;
        public SystemConfigurationRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _systemConfigurations = dbContext.Set<SystemConfiguration>();
        }

        public async Task<float> GetReSellerPercentDiscountPriceAsync()
        {
            SystemConfiguration? systemConfiguration = await _systemConfigurations.FirstOrDefaultAsync(conf => conf.Id == (int)SystemConfigurationType.ReSellerPercentDiscountPrice);
            return systemConfiguration != null ? float.Parse(systemConfiguration.Value) : 25;
        }

        public async Task<SystemConfiguration> GetSystemConfigurationByIdAsync(int id)
        {
            return await _systemConfigurations.FirstOrDefaultAsync(conf => conf.Id == id);
        }

        public async Task<int> GetTestingPeriodInMonthsAsync()
        {
            SystemConfiguration? systemConfiguration = await _systemConfigurations.FirstOrDefaultAsync(conf => conf.Id == (int)SystemConfigurationType.TestingPeriodInMonths);
            return systemConfiguration != null ? int.Parse(systemConfiguration.Value) : 1;
        }
    }
}
