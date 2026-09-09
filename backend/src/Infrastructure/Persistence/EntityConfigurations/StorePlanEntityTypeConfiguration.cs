using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using Infrastructure.Persistence.Contexts;
using Domain.Entities.Plans;
using Domain.Common.Enums;
using Domain.Common.Extensions;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class StorePlanEntityTypeConfiguration : IEntityTypeConfiguration<StorePlan>
    {
        private readonly ApplicationDbContext _context;
        public StorePlanEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<StorePlan> builder)
        {
            builder.HasKey(x => x.Id);

            builder.HasData(
                StorePlan.Create((int)StorePlanType.Gratis, StorePlanType.Gratis.GetDescription(), 1, true),
                StorePlan.Create((int)StorePlanType.Pago, StorePlanType.Pago.GetDescription(), 2, true),
                StorePlan.Create((int)StorePlanType.Superior, StorePlanType.Superior.GetDescription(), 3, true),
                StorePlan.Create((int)StorePlanType.VIP, StorePlanType.VIP.GetDescription(), 4, true));
        }
    }
}