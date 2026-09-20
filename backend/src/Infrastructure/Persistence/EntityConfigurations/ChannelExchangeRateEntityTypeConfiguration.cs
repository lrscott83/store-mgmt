using Domain.Entities.ChannelExchangeRates;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.Persistence.EntityConfigurations
{
    internal sealed class ChannelExchangeRateEntityTypeConfiguration : IEntityTypeConfiguration<ChannelExchangeRate>
    {
        private readonly ApplicationDbContext _context;
        public ChannelExchangeRateEntityTypeConfiguration(ApplicationDbContext context)
        {
            _context = context;
        }

        public void Configure(EntityTypeBuilder<ChannelExchangeRate> builder)
        {
            builder.HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId);
            builder.HasIndex(x => x.TenantId);
            builder.HasIndex(x => x.StoreId);

            builder.HasKey(x => x.Id);

            builder.Property(x => x.Value).HasColumnType("decimal(18,6)");

            builder.HasOne(x => x.Store)
                .WithMany()
                .HasForeignKey(x => x.StoreId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
