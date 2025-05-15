using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.SystemConfigurations;
using Domain.Common.Enums;
using Domain.Common.Extensions;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class SystemConfigurationEntityTypeConfiguration : IEntityTypeConfiguration<SystemConfiguration>
    {
        private readonly ApplicationDbContext _context;
        public SystemConfigurationEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<SystemConfiguration> builder)
        {

            builder.HasKey(x => x.Id);

            builder.HasIndex(x => x.Name).IsUnique();

            builder.HasData(
                SystemConfiguration.Create((int)SystemConfigurationType.TestingPeriodInMonths, 
                SystemConfigurationType.TestingPeriodInMonths.GetDisplayName(), "1"));
            builder.HasData(
                SystemConfiguration.Create((int)SystemConfigurationType.ReSellerPercentDiscountPrice,
                SystemConfigurationType.ReSellerPercentDiscountPrice.GetDisplayName(), "25"));
        }
    }
}
